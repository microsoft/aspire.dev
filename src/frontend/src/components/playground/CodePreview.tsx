import React, { useState } from 'react';
import type { GeneratedCode } from '../../utils/codeGenerator';

interface CodePreviewProps {
    code: GeneratedCode;
    onClose: () => void;
}

const CodePreview: React.FC<CodePreviewProps> = ({ code, onClose }) => {
    const [activeTab, setActiveTab] = useState<'apphost' | 'packages' | 'deploy'>('apphost');
    const [copied, setCopied] = useState(false);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="code-preview">
            <div className="code-header">
                <h3>Generated Code</h3>
                <button onClick={onClose} className="close-btn">✕</button>
            </div>

            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'apphost' ? 'active' : ''}`}
                    onClick={() => setActiveTab('apphost')}
                >
                    📝 AppHost.cs
                </button>
                <button
                    className={`tab ${activeTab === 'packages' ? 'active' : ''}`}
                    onClick={() => setActiveTab('packages')}
                >
                    📦 NuGet Packages
                </button>
                <button
                    className={`tab ${activeTab === 'deploy' ? 'active' : ''}`}
                    onClick={() => setActiveTab('deploy')}
                >
                    🚀 Deploy
                </button>
            </div>

            <div className="code-content">
                {activeTab === 'apphost' && (
                    <div className="code-section">
                        <div className="code-toolbar">
                            <span className="code-label">AppHost/Program.cs</span>
                            <button
                                onClick={() => copyToClipboard(code.appHost)}
                                className="copy-btn"
                            >
                                {copied ? '✓ Copied!' : '📋 Copy'}
                            </button>
                        </div>
                        <pre className="code-block" data-language="csharp">
                            <code className="language-csharp">{code.appHost || '// Add resources to generate code'}</code>
                        </pre>
                        <div className="code-info">
                            <p>💡 This code defines your Aspire application's architecture.</p>
                            <ol>
                                <li>Resources are declared with their configuration</li>
                                <li>Dependencies are wired via <code>.WithReference()</code></li>
                                <li>Build and run with <code>aspire run</code></li>
                            </ol>
                        </div>
                    </div>
                )}

                {activeTab === 'packages' && (
                    <div className="code-section">
                        <div className="code-toolbar">
                            <span className="code-label">Required NuGet Packages</span>
                        </div>
                        {code.nugetPackages.length > 0 ? (
                            <>
                                <div className="package-list">
                                    {code.nugetPackages.map(pkg => (
                                        <div key={pkg} className="package-item">
                                            <span className="package-icon">📦</span>
                                            <code>{pkg}</code>
                                        </div>
                                    ))}
                                </div>
                                <div className="code-info">
                                    <p>💡 Install these packages in your AppHost project:</p>
                                    <pre className="code-block" data-language="bash">
                                        <code className="language-bash">{code.nugetPackages.map(pkg => `dotnet add package ${pkg}`).join('\n')}</code>
                                    </pre>
                                    <button
                                        onClick={() => copyToClipboard(code.nugetPackages.map(pkg => `dotnet add package ${pkg}`).join('\n'))}
                                        className="copy-btn"
                                    >
                                        {copied ? '✓ Copied!' : '📋 Copy All Commands'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="empty-state">
                                <p>No additional packages required yet.</p>
                                <p>Add resources to see required NuGet packages.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'deploy' && (
                    <div className="code-section">
                        <div className="code-toolbar">
                            <span className="code-label">Deployment Options</span>
                        </div>
                        <div className="deploy-options">
                            <div className="deploy-card">
                                <h4>🏃 Run Locally</h4>
                                <pre className="code-block"><code>aspire run</code></pre>
                                <p>Launch the Aspire dashboard and run all services locally</p>
                            </div>

                            <div className="deploy-card">
                                <h4>🐳 Docker Compose</h4>
                                <pre className="code-block"><code>aspire deploy --format docker-compose --output-path ./deploy</code></pre>
                                <p>Generate docker-compose.yml for container orchestration</p>
                            </div>

                            <div className="deploy-card">
                                <h4>☸️ Kubernetes</h4>
                                <pre className="code-block"><code>aspire deploy --format kubernetes --output-path ./deploy</code></pre>
                                <p>Generate Kubernetes manifests for deployment</p>
                            </div>

                            <div className="deploy-card">
                                <h4>☁️ Azure Container Apps</h4>
                                <pre className="code-block"><code>azd init
                                    azd up</code></pre>
                                <p>Deploy to Azure Container Apps with Azure Developer CLI</p>
                            </div>
                        </div>
                        <div className="code-info">
                            <p>💡 <strong>Pro Tips:</strong></p>
                            <ul>
                                <li>Use <code>aspire run</code> for local development with live reload</li>
                                <li>Use <code>aspire deploy</code> to generate deployment artifacts</li>
                                <li>Aspire handles service discovery, health checks, and observability automatically</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
        .code-preview {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--sl-color-bg-nav);
        }

        .code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--sl-color-gray-5);
        }

        .code-header h3 {
          margin: 0;
          color: var(--sl-color-white);
          font-size: 1.25rem;
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--sl-color-gray-3);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          line-height: 1;
        }

        .close-btn:hover {
          color: var(--sl-color-white);
        }

        .tabs {
          display: flex;
          gap: 0.5rem;
          padding: 1rem 1rem 0 1rem;
          border-bottom: 1px solid var(--sl-color-gray-5);
        }

        .tab {
          padding: 0.5rem 1rem;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--sl-color-gray-3);
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .tab:hover {
          color: var(--sl-color-white);
        }

        .tab.active {
          color: var(--sl-color-accent);
          border-bottom-color: var(--sl-color-accent);
        }

        .code-content {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .code-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .code-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .code-label {
          color: var(--sl-color-gray-2);
          font-size: 0.875rem;
          font-weight: 600;
        }

        .copy-btn {
          padding: 0.375rem 0.75rem;
          background: var(--sl-color-gray-6);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 4px;
          color: var(--sl-color-white);
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-btn:hover {
          background: var(--sl-color-gray-5);
        }

        .code-block {
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          padding: 1rem;
          overflow-x: auto;
          font-family: var(--sl-font-mono);
          font-size: 0.875rem;
          line-height: 1.6;
          color: var(--sl-color-white);
          margin: 0;
        }

        .code-block code {
          font-family: inherit;
          color: inherit;
        }

        .code-info {
          background: var(--sl-color-gray-6);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          padding: 1rem;
          color: var(--sl-color-gray-2);
          font-size: 0.875rem;
        }

        .code-info p {
          margin: 0 0 0.5rem 0;
        }

        .code-info ol,
        .code-info ul {
          margin: 0.5rem 0 0 0;
          padding-left: 1.5rem;
        }

        .code-info li {
          margin: 0.25rem 0;
        }

        .code-info code {
          background: var(--sl-color-bg);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-family: var(--sl-font-mono);
          font-size: 0.8125rem;
        }

        .package-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .package-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          padding: 0.75rem;
        }

        .package-icon {
          font-size: 1.25rem;
        }

        .package-item code {
          font-family: var(--sl-font-mono);
          color: var(--sl-color-white);
          font-size: 0.875rem;
        }

        .deploy-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .deploy-card {
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          padding: 1rem;
        }

        .deploy-card h4 {
          margin: 0 0 0.5rem 0;
          color: var(--sl-color-white);
          font-size: 1rem;
        }

        .deploy-card p {
          margin: 0.5rem 0 0 0;
          color: var(--sl-color-gray-3);
          font-size: 0.8125rem;
        }

        .empty-state {
          text-align: center;
          padding: 2rem;
          color: var(--sl-color-gray-3);
        }

        .empty-state p {
          margin: 0.5rem 0;
        }
      `}</style>
        </div>
    );
};

export default CodePreview;
