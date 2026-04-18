// solanaLogger.js — Trazabilidad de alertas críticas en Solana
// Usa @solana/web3.js con memo program para registrar datos en blockchain

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');

const fs   = require('fs');
const path = require('path');

// ID del Memo Program de Solana (programa nativo, gratis de usar)
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

class SolanaLogger {
  constructor(config = {}) {
    // Endpoint RPC — Devnet para desarrollo, Mainnet para producción
    const rpcUrl = config.SOLANA_RPC_URL
      || (config.SOLANA_NETWORK === 'mainnet-beta'
          ? 'https://api.mainnet-beta.solana.com'
          : 'https://api.devnet.solana.com');

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.network    = config.SOLANA_NETWORK || 'devnet';
    this.enabled    = config.SOLANA_ENABLED !== 'false'; // por defecto activo

    // Cargar o generar keypair (wallet del backend)
    this.keypair = this._loadOrCreateKeypair(config.SOLANA_KEYPAIR_PATH);

    // Cola de reintentos (para no perder alertas si falla la red)
    this.retryQueue = [];
    this._startRetryWorker();

    console.log(`SolanaLogger iniciado`);
    console.log(`  Red:     ${this.network}`);
    console.log(`  Wallet:  ${this.keypair.publicKey.toString()}`);
    console.log(`  Activo:  ${this.enabled}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTODO PRINCIPAL: registrar alerta en blockchain
  // ═══════════════════════════════════════════════════════════════

  async logAlert(prediction) {
    if (!this.enabled) {
      return { skipped: true, reason: 'Solana logging desactivado' };
    }

    // Solo registrar warning y critical (no safe ni watch)
    if (!['warning', 'critical'].includes(prediction.alert_level)) {
      return { skipped: true, reason: 'Nivel de alerta no requiere registro' };
    }

    // Construir el payload — debe ser < 566 bytes (límite del Memo Program)
    const payload = this._buildPayload(prediction);

    try {
      const txHash = await this._sendMemoTransaction(payload);

      const result = {
        success: true,
        tx_hash: txHash,
        network: this.network,
        explorer_url: this._explorerUrl(txHash),
        payload_size_bytes: Buffer.byteLength(payload, 'utf8'),
        timestamp: new Date().toISOString()
      };

      console.log(`Solana TX registrada: ${txHash}`);
      console.log(`  Explorer: ${result.explorer_url}`);

      return result;

    } catch (error) {
      console.error('Error registrando en Solana:', error.message);

      // Agregar a cola de reintentos
      this.retryQueue.push({ prediction, attempts: 0, error: error.message });

      return {
        success: false,
        error: error.message,
        queued_for_retry: true
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CONSTRUCCIÓN DEL PAYLOAD (JSON compacto < 566 bytes)
  // ═══════════════════════════════════════════════════════════════

  _buildPayload(prediction) {
    // Incluir solo lo esencial para trazabilidad
    const compact = {
      sys: 'safeCareNeo',
      v:   '1',
      id:  prediction.unidad_id,
      ts:  Math.floor(new Date(prediction.timestamp).getTime() / 1000),
      lvl: prediction.alert_level,       // 'warning' | 'critical'
      score: prediction.risk_score,
      risks: prediction.current_risks
        .filter(r => r.severity === 'critical' || r.severity === 'warning')
        .map(r => ({ t: r.type, s: r.severity, v: r.value }))
        .slice(0, 3),                    // máx 3 riesgos para no exceder límite
      trend: prediction.trend_risks
        .filter(r => r.severity === 'critical')
        .map(r => r.type)
        .slice(0, 2)
    };

    const json = JSON.stringify(compact);

    // Verificar tamaño — el Memo Program acepta hasta 566 bytes
    const bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > 550) {
      // Reducir aún más si es necesario
      compact.risks = compact.risks.slice(0, 1);
      compact.trend = [];
      return JSON.stringify(compact);
    }

    return json;
  }

  // ═══════════════════════════════════════════════════════════════
  // ENVIAR TRANSACCIÓN CON MEMO PROGRAM
  // ═══════════════════════════════════════════════════════════════

  async _sendMemoTransaction(memoData) {
    // Verificar balance antes de enviar
    await this._ensureBalance();

    const transaction = new Transaction();

    // Instrucción del Memo Program — escribe datos en blockchain
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoData, 'utf8')
    });

    transaction.add(memoInstruction);

    // Obtener blockhash reciente
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.keypair.publicKey;

    // Firmar y enviar
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.keypair],
      {
        commitment: 'confirmed',
        maxRetries: 3
      }
    );

    return signature;
  }

  // ═══════════════════════════════════════════════════════════════
  // GESTIÓN DE WALLET Y BALANCE
  // ═══════════════════════════════════════════════════════════════

  _loadOrCreateKeypair(keypairPath) {
    const kpPath = keypairPath || path.join(process.cwd(), 'solana-wallet.json');

    if (fs.existsSync(kpPath)) {
      const secretKey = JSON.parse(fs.readFileSync(kpPath, 'utf8'));
      console.log(`  Wallet cargada desde: ${kpPath}`);
      return Keypair.fromSecretKey(new Uint8Array(secretKey));
    }

    // Generar nueva wallet y guardar
    const keypair = Keypair.generate();
    fs.writeFileSync(kpPath, JSON.stringify(Array.from(keypair.secretKey)));
    console.log(`  Nueva wallet generada y guardada en: ${kpPath}`);
    console.log(`  IMPORTANTE: Hacer backup de este archivo`);

    return keypair;
  }

  async _ensureBalance() {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;

    // Cada transacción cuesta ~0.000005 SOL en Devnet
    if (balanceSOL < 0.01) {
      if (this.network === 'devnet') {
        console.log('Balance bajo en Devnet — solicitando airdrop...');
        try {
          const sig = await this.connection.requestAirdrop(
            this.keypair.publicKey,
            1 * LAMPORTS_PER_SOL  // 1 SOL de Devnet (gratis)
          );
          await this.connection.confirmTransaction(sig);
          console.log('Airdrop de 1 SOL recibido (Devnet)');
        } catch (e) {
          console.warn('Airdrop falló (límite de tasa):', e.message);
        }
      } else {
        console.warn(`ADVERTENCIA: Balance bajo en Mainnet: ${balanceSOL} SOL`);
        console.warn('Recargar wallet:', this.keypair.publicKey.toString());
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COLA DE REINTENTOS (resilencia ante fallos de red)
  // ═══════════════════════════════════════════════════════════════

  _startRetryWorker() {
    // Reintentar cada 2 minutos
    setInterval(async () => {
      if (this.retryQueue.length === 0) return;

      const item = this.retryQueue.shift();
      item.attempts++;

      if (item.attempts > 5) {
        console.error(`Solana: Alerta descartada tras 5 intentos: ${item.prediction.unidad_id}`);
        return;
      }

      try {
        const payload = this._buildPayload(item.prediction);
        const txHash  = await this._sendMemoTransaction(payload);
        console.log(`Solana: Reintento exitoso (intento ${item.attempts}): ${txHash}`);
      } catch (err) {
        console.warn(`Solana: Reintento ${item.attempts} fallido: ${err.message}`);
        this.retryQueue.push(item); // Volver a la cola
      }
    }, 2 * 60 * 1000);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILIDADES
  // ═══════════════════════════════════════════════════════════════

  _explorerUrl(txHash) {
    const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
    return `https://explorer.solana.com/tx/${txHash}${cluster}`;
  }

  async getWalletInfo() {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return {
      public_key: this.keypair.publicKey.toString(),
      network: this.network,
      balance_sol: (balance / LAMPORTS_PER_SOL).toFixed(6),
      balance_lamports: balance,
      explorer_url: `https://explorer.solana.com/address/${this.keypair.publicKey}${this.network !== 'mainnet-beta' ? `?cluster=${this.network}` : ''}`
    };
  }

  async verifyTransaction(txHash) {
    try {
      const tx = await this.connection.getTransaction(txHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!tx) return { found: false };

      // Extraer el memo del log de mensajes
      const memo = tx.meta?.logMessages
        ?.find(m => m.includes('Program log: Memo'))
        ?.replace('Program log: Memo (len ', '')
        ?.split('):')[1]
        ?.trim();

      return {
        found: true,
        confirmed: true,
        slot: tx.slot,
        block_time: tx.blockTime,
        memo_data: memo,
        fee_lamports: tx.meta?.fee
      };
    } catch (err) {
      return { found: false, error: err.message };
    }
  }
}

module.exports = SolanaLogger;