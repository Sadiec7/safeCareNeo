#include "DisplayUI.h"
#include <M5Unified.h>
#include <WiFi.h>

// ── Paleta ───────────────────────────────────────────────────────────────────
#define COL_BG        0x0820
#define COL_PANEL     0x1082
#define COL_ACCENT    0x07FF
#define COL_TEMP_OK   0x07E0
#define COL_TEMP_HI   0xF800
#define COL_HUM       0x04FF
#define COL_PRES      0xFD20
#define COL_GRID      0x2945
#define COL_TEXT_DIM  0x4A69

// Colores minimalistas
#define COL_FACE_BG   0x0820   // fondo (igual que COL_BG)
#define COL_HEAD_FILL 0x1A1F   // círculo cabeza gris oscuro
#define COL_HEAD_RING 0x07FF   // contorno cabeza — acento cyan
#define COL_EYE_DOT   0x07FF   // ojos: puntos cyan
#define COL_EYE_BLINK 0x07FF   // ojo cerrado
#define COL_MOUTH_C   0x07FF   // boca
#define COL_BG_FACE   0x0820   // alias para compatibilidad
#define COL_WAVE1     0x07FF
#define COL_WAVE2     0x034A
#define COL_WAVE3     0x0228

// ── Historial de temperatura ─────────────────────────────────────────────────
float tempHistory[GRAPH_POINTS] = {0};
int   historyIndex = 0;

void pushTempHistory(float t) {
    tempHistory[historyIndex] = t;
    historyIndex = (historyIndex + 1) % GRAPH_POINTS;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
static void drawRoundPanel(int x, int y, int w, int h, uint16_t col) {
    M5.Display.fillRoundRect(x, y, w, h, 6, col);
}
static void drawLabelValue(int x, int y, const char* label, const char* value,
                            uint16_t valColor, int labelSize = 1, int valSize = 2) {
    M5.Display.setTextSize(labelSize);
    M5.Display.setTextColor(COL_TEXT_DIM);
    M5.Display.setCursor(x, y);
    M5.Display.print(label);
    M5.Display.setTextSize(valSize);
    M5.Display.setTextColor(valColor);
    M5.Display.setCursor(x, y + 14);
    M5.Display.print(value);
}

// ── Gráfica ───────────────────────────────────────────────────────────────────
#define GX 172
#define GY  52
#define GW 140
#define GH  95
#define TMIN 35.0f
#define TMAX 39.5f

static void drawTempGraph() {
    drawRoundPanel(GX-2, GY-2, GW+4, GH+22, COL_PANEL);
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(COL_ACCENT);
    M5.Display.setCursor(GX, GY-14);
    M5.Display.print("TEMP TREND");
    for (int i = 0; i <= 3; i++) {
        int gy = GY + (GH * i / 3);
        M5.Display.drawFastHLine(GX, gy, GW, COL_GRID);
        float label = TMAX - (TMAX-TMIN)*i/3.0f;
        char buf[6]; snprintf(buf, sizeof(buf), "%.1f", label);
        M5.Display.setTextSize(1); M5.Display.setTextColor(COL_GRID);
        M5.Display.setCursor(GX+GW+2, gy-4); M5.Display.print(buf);
    }
    int safeY = GY + (int)((TMAX-37.5f)/(TMAX-TMIN)*GH);
    for (int x = GX; x < GX+GW; x += 5) M5.Display.drawPixel(x, safeY, COL_TEMP_HI);
    int prevX = -1, prevY = -1;
    for (int i = 0; i < GRAPH_POINTS; i++) {
        int idx = (historyIndex+i)%GRAPH_POINTS;
        float v = tempHistory[idx];
        if (v == 0) { prevX = prevY = -1; continue; }
        float cl = constrain(v, TMIN, TMAX);
        int px = GX + (int)(i*(GW-1)/(float)(GRAPH_POINTS-1));
        int py = GY + GH - (int)((cl-TMIN)/(TMAX-TMIN)*GH);
        uint16_t lc = (v > 37.5f) ? COL_TEMP_HI : COL_TEMP_OK;
        if (prevX >= 0) M5.Display.drawLine(prevX, prevY, px, py, lc);
        if (i==GRAPH_POINTS-1 || tempHistory[(historyIndex+i+1)%GRAPH_POINTS]==0)
            M5.Display.fillCircle(px, py, 2, WHITE);
        prevX = px; prevY = py;
    }
    M5.Display.setTextSize(1); M5.Display.setTextColor(COL_TEXT_DIM);
    M5.Display.setCursor(GX, GY+GH+4); M5.Display.print("  <-- tiempo real -->");
}

static void drawStatusBar(bool wifiOk) {
    M5.Display.fillRect(0, 222, 320, 18, COL_PANEL);
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(wifiOk ? COL_TEMP_OK : COL_TEMP_HI);
    M5.Display.setCursor(6, 225); M5.Display.print(wifiOk ? "WiFi OK" : "OFFLINE");
    M5.Display.setTextColor(COL_TEXT_DIM);
    M5.Display.setCursor(70, 225); M5.Display.print("[A] Consultar IA");
    static bool pulse = false; static uint32_t lastP = 0;
    if (millis()-lastP > 2000) { pulse=!pulse; lastP=millis(); }
    M5.Display.fillCircle(308, 230, 4, pulse ? COL_TEMP_OK : COL_GRID);
}

void setupVisuals() {
    auto cfg = M5.config();
    M5.begin(cfg);
    M5.Display.setRotation(1);
    M5.Display.fillScreen(COL_BG);
    M5.Speaker.begin();
    M5.Speaker.setVolume(200);
}

void dibujarDashboard(float temp, float hum, int pres) {
    M5.Display.fillScreen(COL_BG);
    M5.Display.fillRect(0, 0, 320, 32, COL_PANEL);
    M5.Display.fillRect(0, 30, 320, 2, COL_ACCENT);
    M5.Display.setTextSize(2); M5.Display.setTextColor(COL_ACCENT);
    M5.Display.setCursor(8, 7); M5.Display.print("NEOSENSE");
    M5.Display.setTextColor(WHITE); M5.Display.print(" AI");
    static bool live = false; static uint32_t lastLive = 0;
    if (millis()-lastLive > 1000) { live=!live; lastLive=millis(); }
    M5.Display.fillCircle(248, 15, 5, live ? COL_TEMP_HI : COL_GRID);
    M5.Display.setTextSize(1); M5.Display.setTextColor(COL_TEXT_DIM);
    M5.Display.setCursor(256, 11); M5.Display.print("LIVE");
    char upbuf[16]; snprintf(upbuf, sizeof(upbuf), "%lus", millis()/1000);
    M5.Display.setCursor(285, 11); M5.Display.setTextColor(COL_GRID); M5.Display.print(upbuf);

    drawRoundPanel(4, 38, 158, 72, COL_PANEL);
    uint16_t tempCol = (temp>37.5f) ? COL_TEMP_HI : COL_TEMP_OK;
    char tbuf[10]; snprintf(tbuf, sizeof(tbuf), "%.1f C", temp);
    drawLabelValue(12, 42, "TEMPERATURA", tbuf, tempCol);
    float tPct = constrain((temp-35.0f)/(40.0f-35.0f), 0, 1);
    M5.Display.fillRoundRect(12, 90, 142, 10, 3, COL_GRID);
    M5.Display.fillRoundRect(12, 90, (int)(142*tPct), 10, 3, tempCol);

    drawRoundPanel(4, 118, 158, 58, COL_PANEL);
    char hbuf[10]; snprintf(hbuf, sizeof(hbuf), "%.1f %%", hum);
    drawLabelValue(12, 122, "HUMEDAD", hbuf, COL_HUM);
    float hPct = constrain(hum/100.0f, 0, 1);
    M5.Display.fillRoundRect(12, 162, 142, 8, 3, COL_GRID);
    M5.Display.fillRoundRect(12, 162, (int)(142*hPct), 8, 3, COL_HUM);

    drawRoundPanel(4, 184, 158, 34, COL_PANEL);
    char pbuf[12]; snprintf(pbuf, sizeof(pbuf), "%d hPa", pres);
    M5.Display.setTextSize(1); M5.Display.setTextColor(COL_TEXT_DIM);
    M5.Display.setCursor(12, 188); M5.Display.print("PRESION");
    M5.Display.setTextSize(2); M5.Display.setTextColor(COL_PRES);
    M5.Display.setCursor(12, 200); M5.Display.print(pbuf);

    drawTempGraph();
    drawStatusBar(WiFi.status() == WL_CONNECTED);
}

void mostrarCargando() {
    M5.Display.fillScreen(COL_BG);
    static uint32_t t0 = millis();
    uint32_t el = millis()-t0;
    uint8_t br = (uint8_t)(127+127*sinf(el*0.005f));
    M5.Display.drawRoundRect(20, 60, 280, 120, 12, M5.Display.color888(0,br/2,br));
    M5.Display.drawRoundRect(22, 62, 276, 116, 10, COL_GRID);
    M5.Display.setTextSize(2); M5.Display.setTextColor(COL_ACCENT);
    M5.Display.setCursor(52, 88); M5.Display.print("Consultando IA...");
    uint8_t dot = (millis()/400)%4;
    for (int i = 0; i < 3; i++) {
        M5.Display.fillCircle(118+i*28, 138, 7, (i<(int)dot) ? COL_ACCENT : COL_GRID);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CARA MINIMALISTA — pantalla completa (320×240)
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Diseño flat / minimalista:
//  • Círculo oscuro con contorno cyan fino
//  • Ojos = dos píldoras verticales cyan
//  • Boca = línea recta neutra en reposo / apertura simple al hablar
//  • Sin cabello, sin rubor, sin pestañas
//  • Ondas concéntricas al hablar

#define FC_X  160
#define FC_Y  108   // ligeramente arriba para dar espacio al subtítulo
#define FC_R   72   // radio compacto y limpio

// ── Cara base minimalista ─────────────────────────────────────────────────────
static void drawFaceBase(int cx, int cy, int r) {
    M5.Display.fillCircle(cx, cy, r, COL_HEAD_FILL);
    M5.Display.drawCircle(cx, cy, r,     COL_HEAD_RING);
    M5.Display.drawCircle(cx, cy, r - 1, COL_HEAD_RING);
}

// ── Ojos minimalistas ─────────────────────────────────────────────────────────
static void drawEye(int ex, int ey, bool blink) {
    if (blink) {
        M5.Display.drawFastHLine(ex - 8, ey, 16, COL_EYE_BLINK);
        M5.Display.drawFastHLine(ex - 8, ey + 1, 16, COL_EYE_BLINK);
        return;
    }
    // Píldora vertical 10×16 px
    M5.Display.fillRoundRect(ex - 5, ey - 8, 10, 16, 5, COL_EYE_DOT);
}

// ── Cejas (eliminadas en diseño minimalista — función vacía por compatibilidad)
static void drawEyebrows(int cx, int cy) { (void)cx; (void)cy; }

// ── Nariz (eliminada en diseño minimalista — función vacía por compatibilidad)
static void drawNose(int cx, int cy) { (void)cx; (void)cy; }

// ── Rubor (eliminado en diseño minimalista — función vacía por compatibilidad)
static void drawBlush(int cx, int cy) { (void)cx; (void)cy; }

// ── Boca minimalista animada ──────────────────────────────────────────────────
// phase 0    = línea recta neutra
// phase 1-7  = apertura simple con dos líneas horizontales + comisuras
static void drawMouth(int cx, int cy, uint8_t phase) {
    int my = cy + 28;
    int mw = 18;

    // Limpiar zona boca
    M5.Display.fillRect(cx - mw - 2, my - 2, (mw * 2) + 4, 22, COL_HEAD_FILL);

    if (phase == 0) {
        // Línea recta neutra (dos píxeles de grosor)
        M5.Display.drawFastHLine(cx - mw, my, mw * 2, COL_MOUTH_C);
        M5.Display.drawFastHLine(cx - mw, my + 1, mw * 2, COL_MOUTH_C);
        return;
    }

    static const int8_t heights[] = {0, 3, 6, 9, 12, 14, 12, 9};
    int h = heights[phase % 8];

    // Labio superior
    M5.Display.drawFastHLine(cx - mw, my, mw * 2, COL_MOUTH_C);
    M5.Display.drawFastHLine(cx - mw, my + 1, mw * 2, COL_MOUTH_C);
    // Labio inferior
    M5.Display.drawFastHLine(cx - mw + 4, my + h + 2, (mw - 4) * 2, COL_MOUTH_C);
    M5.Display.drawFastHLine(cx - mw + 4, my + h + 3, (mw - 4) * 2, COL_MOUTH_C);
    // Comisuras
    M5.Display.drawFastVLine(cx - mw,     my, h / 2 + 2, COL_MOUTH_C);
    M5.Display.drawFastVLine(cx - mw + 1, my, h / 2 + 2, COL_MOUTH_C);
    M5.Display.drawFastVLine(cx + mw - 1, my, h / 2 + 2, COL_MOUTH_C);
    M5.Display.drawFastVLine(cx + mw,     my, h / 2 + 2, COL_MOUTH_C);
}

// ── Ondas de sonido ────────────────────────────────────────────────────────────
static void drawSoundWaves(int cx, int cy, uint8_t phase) {
    // 3 arcos a cada lado que pulsan con el phase
    for (int w = 1; w <= 3; w++) {
        int offset = (w == 1) ? 0 : (w == 2) ? 4 : 8;
        int pulse  = (phase % 3 == w-1) ? 3 : 0;  // un arco "brilla" por turno
        int wr = FC_R + 14 + w * 14 + pulse;
        uint16_t wc = (w == 1) ? COL_WAVE1 : (w == 2 ? COL_WAVE2 : COL_WAVE3);

        // Arco izquierdo (ángulos 120°-240°)
        for (int a = 120; a <= 240; a += 4) {
            float rad = a * 3.14159f / 180.0f;
            int wx = cx + (int)(wr * cosf(rad));
            int wy = cy + (int)(wr * sinf(rad));
            if (wx >= 0 && wx < 320 && wy >= 0 && wy < 240)
                M5.Display.drawPixel(wx, wy, wc);
        }
        // Arco derecho (ángulos -60°-60°)
        for (int a = -60; a <= 60; a += 4) {
            float rad = a * 3.14159f / 180.0f;
            int wx = cx + (int)(wr * cosf(rad));
            int wy = cy + (int)(wr * sinf(rad));
            if (wx >= 0 && wx < 320 && wy >= 0 && wy < 240)
                M5.Display.drawPixel(wx, wy, wc);
        }
    }
}

// ── Texto subtitulado debajo de la cara ────────────────────────────────────────
static void drawSubtitle(const String& texto, bool hablandoActivo) {
    // Barra inferior oscura para el subtítulo
    M5.Display.fillRect(0, 210, 320, 30, COL_PANEL);
    M5.Display.fillRect(0, 208, 320, 2, COL_ACCENT);

    M5.Display.setTextSize(1);
    M5.Display.setTextColor(hablandoActivo ? COL_ACCENT : COL_TEXT_DIM);
    M5.Display.setCursor(6, 215);
    M5.Display.setTextWrap(true);

    // Mostrar primeras ~52 chars (una línea)
    String linea = texto.substring(0, min((int)texto.length(), 52));
    M5.Display.print(linea);
    M5.Display.setTextWrap(false);
}

// ── Función principal de dibujo de la cara (full screen) ─────────────────────
static String g_textoActual = "";

static void drawChibiFace(uint8_t phase, bool speaking) {
    int cx = FC_X;
    int cy = FC_Y;
    int r  = FC_R;

    // Fondo sólido
    M5.Display.fillScreen(COL_BG_FACE);

    // Ondas de sonido DETRÁS de la cara (solo si habla)
    if (speaking) drawSoundWaves(cx, cy, phase);

    // Cara base
    drawFaceBase(cx, cy, r);

    // Ojos (parpadeo suave en reposo)
    static uint8_t blinkCounter = 0;
    bool blink = false;
    if (!speaking) {
        blinkCounter++;
        if (blinkCounter > 60) { blink = true; blinkCounter = 0; }
    }
    drawEye(cx - 26, cy - 12, blink);
    drawEye(cx + 26, cy - 12, blink);

    // Boca animada
    drawMouth(cx, cy, speaking ? phase : 0);

    // Subtítulo
    drawSubtitle(g_textoActual, speaking);
}

// ── mostrarPantallaIA ─────────────────────────────────────────────────────────
void mostrarPantallaIA(String respuesta) {
    g_textoActual = respuesta;
    drawChibiFace(0, false);
}

// ── animarCaritaHablando ──────────────────────────────────────────────────────
void animarCaritaHablando(bool hablando) {
    static uint32_t lastFrame = 0;
    static uint8_t  phase     = 0;

    uint32_t now = millis();
    uint32_t interval = hablando ? 110 : 900;   // fps más alto al hablar
    if (now - lastFrame < interval) return;
    lastFrame = now;

    if (hablando) phase = (phase + 1) % 8;
    else          phase = 0;

    // Redibujar toda la cara (es rápido porque es primitivas)
    drawChibiFace(phase, hablando);
}