import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, CartesianGrid, Tooltip } from 'recharts';

const LiveMonitor = ({ data, color, title }) => {
  return (
    <div className="monitor-box">
      <div className="monitor-header-ui">
        <div className="monitor-dot" style={{ backgroundColor: color }}></div>
        <span className="monitor-id">{title}</span>
      </div>
      <div style={{ width: '100%', height: '280px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.2} />
            {/* Rango de 0 a 100 para que el 0 no quede cortado */}
            <YAxis hide domain={[0, 100]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff' }}
            />
            <Line 
              type="monotone" 
              dataKey="valor" 
              stroke={color} 
              strokeWidth={3} 
              dot={false} 
              isAnimationActive={true}
              animationDuration={400}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default LiveMonitor;