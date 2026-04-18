import React from "react";


const Header = () => {
  const bebe = {
    nombre: "Alison Ugalde Arias ",
    nacimiento: "15.04.2026"
  };

  return (
    <header className="header-professional">
      {}
      <div className="header-left">
        <img 
          src="/logo.png" 
          alt="SafeCare Logo" 
          className="app-logo" 
          onError={(e) => e.target.src = 'https://via.placeholder.com/50'} 
        />
        <span className="live-indicator">● SISTEMA ACTIVO</span>
      </div>
      
      {/* Centro: Título del Proyecto */}
      <div className="header-center">
        <h1>SAFECARE <span className="blue-text">NEO</span></h1>
      </div>

      {/* Esquina Superior Derecha: Info del Paciente */}
      <div className="header-right">
        <div className="patient-file">
          <span className="file-name">{bebe.nombre}</span>
          <span className="file-date">{bebe.nacimiento}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;