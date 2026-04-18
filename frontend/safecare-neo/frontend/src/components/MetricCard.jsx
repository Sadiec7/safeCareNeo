import React from 'react';

const MetricCard = ({ label, valor, unidad }) => {
  // Función para determinar si el valor es 0 (estado offline)
  const isOffline = valor === 0;

  return (
    <div className={`metric-card ${isOffline ? 'is-offline' : ''}`}>
      <div className="metric-info">
        <span className="metric-label">{label}</span>
        <div className="metric-value-container">
          <span className="metric-value">{valor}</span>
          <span className="metric-unit">{unidad}</span>
        </div>
      </div>
      <div className="metric-status-icon">
        {/* Un pequeño círculo que indica si hay señal o no */}
        <div className={`status-dot ${isOffline ? 'gray' : 'green'}`}></div>
      </div>
    </div>
  );
};

export default MetricCard;