import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface AspireNodeData {
  label: string;
  icon: string;
  color: string;
  category: string;
  resourceType: string;
  instanceName?: string;
  databaseName?: string;
}

const AspireNode = memo(({ data, selected }: NodeProps<AspireNodeData>) => {
  return (
    <div
      className="aspire-node"
      style={{
        background: 'var(--sl-color-bg)',
        border: `2px solid ${selected ? data.color : 'var(--sl-color-gray-5)'}`,
        borderRadius: '8px',
        padding: '12px',
        minWidth: '180px',
        boxShadow: selected
          ? `0 0 0 2px ${data.color}40`
          : '0 2px 8px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: data.color,
          width: '10px',
          height: '10px',
          border: '2px solid white',
        }}
      />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px' }}>{data.icon}</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 'bold',
              color: 'var(--sl-color-white)',
              fontSize: '14px',
            }}
          >
            {data.label}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--sl-color-gray-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {data.category}
          </div>
        </div>
      </div>

      {data.instanceName && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--sl-color-gray-2)',
            padding: '4px 8px',
            background: 'var(--sl-color-gray-6)',
            borderRadius: '4px',
            marginTop: '4px',
            fontFamily: 'var(--sl-font-mono)',
          }}
        >
          "{data.instanceName}"
        </div>
      )}

      {data.databaseName && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--sl-color-gray-3)',
            padding: '2px 6px',
            background: 'var(--sl-color-gray-7)',
            borderRadius: '3px',
            marginTop: '4px',
            fontFamily: 'var(--sl-font-mono)',
          }}
        >
          DB: "{data.databaseName}"
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: data.color,
          width: '10px',
          height: '10px',
          border: '2px solid white',
        }}
      />
    </div>
  );
});

AspireNode.displayName = 'AspireNode';

export default AspireNode;
