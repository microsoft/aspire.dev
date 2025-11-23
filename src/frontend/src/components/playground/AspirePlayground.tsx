import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    type Connection,
    type Node,
    type Edge,
    BackgroundVariant,
    Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AspireNode, { type AspireNodeData } from './AspireNode';
import ResourcePalette from './ResourcePalette';
import CodePreview from './CodePreview';
import { generateAppHostCode } from '../../utils/codeGenerator';
import type { AspireResource } from '../../data/aspire-resources';

const nodeTypes = {
    aspireNode: AspireNode,
};

const AspirePlayground: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<AspireNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNode, setSelectedNode] = useState<Node<AspireNodeData> | null>(null);
    const [showCode, setShowCode] = useState(false);
    const [generatedCode, setGeneratedCode] = useState({ appHost: '', nugetPackages: [], deploymentOptions: [] });
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const nodeIdCounter = useRef(0);
    const [codePanelWidth, setCodePanelWidth] = useState(600);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null); useEffect(() => {
        const code = generateAppHostCode(nodes, edges);
        setGeneratedCode(code);
    }, [nodes, edges]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing) {
                const newWidth = window.innerWidth - e.clientX;
                setCodePanelWidth(Math.max(400, Math.min(newWidth, window.innerWidth - 600)));
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]); const onConnect = useCallback(
        (params: Connection) => {
            // Validate connection: resources connect TO projects, not the other way around
            const sourceNode = nodes.find(n => n.id === params.source);
            const targetNode = nodes.find(n => n.id === params.target);

            if (!sourceNode || !targetNode) return;

            // Projects can reference resources
            const projectTypes = ['dotnet-project', 'node-app', 'vite-app', 'python-app', 'container'];
            const resourceTypes = ['postgres', 'sqlserver', 'mongodb', 'mysql', 'oracle', 'redis', 'valkey', 'garnet', 'rabbitmq', 'kafka', 'nats', 'openai', 'ollama'];

            const sourceIsResource = resourceTypes.includes(sourceNode.data.resourceType);
            const targetIsProject = projectTypes.includes(targetNode.data.resourceType);

            if (sourceIsResource && targetIsProject) {
                setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: sourceNode.data.color } }, eds));
            } else {
                console.warn('Invalid connection: Resources should connect to Projects');
            }
        },
        [nodes, setEdges]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            if (!reactFlowWrapper.current || !reactFlowInstance) return;

            const resourceData = event.dataTransfer.getData('application/reactflow');
            if (!resourceData) return;

            const resource: AspireResource = JSON.parse(resourceData);
            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            addResourceNode(resource, position);
        },
        [reactFlowInstance]
    );

    const addResourceNode = useCallback((resource: AspireResource, position?: { x: number; y: number }) => {
        const nodeId = `node-${nodeIdCounter.current++}`;
        const defaultInstanceName = `${resource.name}${Math.floor(Math.random() * 100)}`;

        const newNode: Node<AspireNodeData> = {
            id: nodeId,
            type: 'aspireNode',
            position: position || { x: Math.random() * 500, y: Math.random() * 500 },
            data: {
                label: resource.displayName,
                icon: resource.icon,
                color: resource.color,
                category: resource.category,
                resourceType: resource.id,
                instanceName: defaultInstanceName,
                databaseName: resource.allowsDatabase ? `${defaultInstanceName}db` : undefined,
            },
        };

        setNodes((nds) => [...nds, newNode]);
    }, [setNodes]);

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node<AspireNodeData>) => {
        setSelectedNode(node);
    }, []);

    const updateNodeData = useCallback((nodeId: string, data: Partial<AspireNodeData>) => {
        setNodes((nds) =>
            nds.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, ...data } }
                    : node
            )
        );
    }, [setNodes]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setEdges([]);
        setSelectedNode(null);
    }, [setNodes, setEdges]);

    const deleteNode = useCallback((nodeId: string) => {
        setNodes((nds) => nds.filter(n => n.id !== nodeId));
        setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        setSelectedNode(null);
    }, [setNodes, setEdges]);

    return (
        <div className="aspire-playground">
            <div className="playground-layout">
                <div className="palette-panel">
                    <ResourcePalette onAddResource={(resource) => addResourceNode(resource)} />
                </div>

                <div className="canvas-panel" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setReactFlowInstance}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeClick={onNodeClick}
                        nodeTypes={nodeTypes}
                        fitView
                        deleteKeyCode="Delete"
                    >
                        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                        <Controls />
                        <MiniMap zoomable pannable />

                        <Panel position="top-left" className="playground-panel">
                            <div className="panel-content">
                                <h2>🎮 Aspire Playground</h2>
                                <p>Build your distributed app visually</p>
                            </div>
                        </Panel>

                        <Panel position="top-right" className="playground-panel">
                            <div className="panel-actions">
                                <button onClick={() => setShowCode(!showCode)} className="action-btn primary">
                                    {showCode ? '🎨 Builder' : '💻 View Code'}
                                </button>
                                <button onClick={clearCanvas} className="action-btn secondary">
                                    🗑️ Clear
                                </button>
                            </div>
                        </Panel>

                        {selectedNode && (
                            <Panel position="bottom-right" className="playground-panel node-properties">
                                <div className="panel-content">
                                    <h3>Node Properties</h3>
                                    <div className="property-form">
                                        <label>
                                            Instance Name:
                                            <input
                                                type="text"
                                                value={selectedNode.data.instanceName || ''}
                                                onChange={(e) => updateNodeData(selectedNode.id, { instanceName: e.target.value })}
                                                placeholder="e.g., api, cache, db"
                                            />
                                        </label>

                                        {selectedNode.data.databaseName !== undefined && (
                                            <label>
                                                Database Name:
                                                <input
                                                    type="text"
                                                    value={selectedNode.data.databaseName || ''}
                                                    onChange={(e) => updateNodeData(selectedNode.id, { databaseName: e.target.value })}
                                                    placeholder="e.g., appdata"
                                                />
                                            </label>
                                        )}

                                        <button
                                            onClick={() => deleteNode(selectedNode.id)}
                                            className="action-btn danger"
                                        >
                                            Delete Node
                                        </button>
                                    </div>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>
                </div>

                {showCode && (
                    <>
                        <div
                            className="resize-handle"
                            onMouseDown={() => setIsResizing(true)}
                            ref={resizeRef}
                        />
                        <div className="code-panel" style={{ width: `${codePanelWidth}px` }}>
                            <CodePreview code={generatedCode} onClose={() => setShowCode(false)} />
                        </div>
                    </>
                )}
            </div>

            <style>{`
        .aspire-playground {
          width: 100%;
          height: 100vh;
          min-height: 100vh;
        }

        .playground-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          height: 100%;
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 8px;
          overflow: hidden;
        }

        .palette-panel {
          height: 100%;
          overflow: hidden;
        }

        .canvas-panel {
          height: 100%;
          position: relative;
          background: var(--sl-color-bg);
        }

        .code-panel {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          background: var(--sl-color-bg-nav);
          border-left: 1px solid var(--sl-color-gray-5);
          z-index: 10;
          overflow-y: auto;
        }

        .resize-handle {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 6px;
          background: transparent;
          cursor: ew-resize;
          z-index: 11;
          transition: background 0.2s;
        }

        .resize-handle:hover {
          background: var(--sl-color-accent);
        }

        .resize-handle:active {
          background: var(--sl-color-accent-high);
        }

        .playground-panel {
          background: var(--sl-color-bg-nav);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .panel-content h2 {
          margin: 0 0 0.25rem 0;
          color: var(--sl-color-white);
          font-size: 1.5rem;
        }

        .panel-content p {
          margin: 0;
          color: var(--sl-color-gray-3);
          font-size: 0.875rem;
        }

        .panel-content h3 {
          margin: 0 0 1rem 0;
          color: var(--sl-color-white);
          font-size: 1.125rem;
        }

        .panel-actions {
          display: flex;
          gap: 0.5rem;
        }

        .action-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn.primary {
          background: var(--sl-color-accent);
          color: white;
        }

        .action-btn.primary:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .action-btn.secondary {
          background: var(--sl-color-gray-6);
          color: var(--sl-color-white);
        }

        .action-btn.secondary:hover {
          background: var(--sl-color-gray-5);
        }

        .action-btn.danger {
          background: #E74856;
          color: white;
          width: 100%;
          margin-top: 0.5rem;
        }

        .action-btn.danger:hover {
          background: #D13438;
        }

        .node-properties {
          min-width: 250px;
        }

        .property-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .property-form label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          color: var(--sl-color-gray-2);
          font-size: 0.875rem;
          font-weight: 500;
        }

        .property-form input {
          padding: 0.5rem;
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 4px;
          color: var(--sl-color-white);
          font-size: 0.875rem;
          font-family: var(--sl-font-mono);
        }

        .property-form input:focus {
          outline: none;
          border-color: var(--sl-color-accent);
        }

        .react-flow__node {
          cursor: grab;
        }

        .react-flow__node:active {
          cursor: grabbing;
        }

        /* Theme-aware React Flow controls */
        .react-flow__controls {
          background: var(--sl-color-bg-nav);
          border: 1px solid var(--sl-color-gray-5);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .react-flow__controls-button {
          background: var(--sl-color-bg);
          border-bottom: 1px solid var(--sl-color-gray-5);
          color: var(--sl-color-white);
        }

        .react-flow__controls-button:hover {
          background: var(--sl-color-gray-6);
        }

        .react-flow__controls-button svg {
          fill: var(--sl-color-white);
        }

        /* Theme-aware minimap */
        .react-flow__minimap {
          background: var(--sl-color-bg-nav);
          border: 1px solid var(--sl-color-gray-5);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .react-flow__minimap-mask {
          fill: var(--sl-color-gray-6);
        }

        .react-flow__minimap-node {
          fill: var(--sl-color-gray-5);
          stroke: var(--sl-color-accent);
        }
      `}</style>
        </div>
    );
};

export default AspirePlayground;
