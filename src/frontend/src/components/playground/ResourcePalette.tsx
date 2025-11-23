import React, { useState } from 'react';
import { aspireResources, resourceCategories } from '../../data/aspire-resources';
import type { AspireResource } from '../../data/aspire-resources';

interface ResourcePaletteProps {
    onAddResource: (resource: AspireResource) => void;
}

const ResourcePalette: React.FC<ResourcePaletteProps> = ({ onAddResource }) => {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredResources = aspireResources.filter(resource => {
        const matchesCategory = !selectedCategory || resource.category === selectedCategory;
        const matchesSearch = resource.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            resource.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="resource-palette">
            <div className="back-nav">
                <a href="/" className="back-link">
                    <span className="back-icon">←</span>
                    <span>Back to aspire.dev</span>
                </a>
            </div>

            <div className="palette-header">
                <h3>Resource Palette</h3>
                <p>Drag or click to add resources to your Aspire app</p>
            </div>

            <div className="search-box">
                <input
                    type="text"
                    placeholder="Search resources..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="category-filter">
                <button
                    className={`category-btn ${!selectedCategory ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(null)}
                >
                    All
                </button>
                {resourceCategories.map(category => (
                    <button
                        key={category.id}
                        className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(category.id)}
                        title={category.name}
                    >
                        <span>{category.icon}</span>
                    </button>
                ))}
            </div>

            <div className="resource-list">
                {filteredResources.map(resource => (
                    <div
                        key={resource.id}
                        className="resource-card"
                        onClick={() => onAddResource(resource)}
                        draggable
                        onDragStart={(e) => {
                            // Serialize only the data we need, not the icon object
                            const resourceData = {
                                ...resource,
                                icon: typeof resource.icon === 'object' && resource.icon.src 
                                    ? resource.icon.src 
                                    : resource.icon
                            };
                            e.dataTransfer.setData('application/reactflow', JSON.stringify(resourceData));
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        style={{ borderLeft: `4px solid ${resource.color}` }}
                    >
                        <div className="resource-card-header">
                            <div className="resource-icon">
                                {typeof resource.icon === 'string' && resource.icon.startsWith('/') ? (
                                    <img src={resource.icon} alt={resource.displayName} />
                                ) : typeof resource.icon === 'object' && resource.icon.src ? (
                                    <img src={resource.icon.src} alt={resource.displayName} />
                                ) : (
                                    <span>{resource.icon}</span>
                                )}
                            </div>
                            <div className="resource-info">
                                <div className="resource-name">{resource.displayName}</div>
                                <div className="resource-category">{resource.category}</div>
                            </div>
                        </div>
                        <div className="resource-description">{resource.description}</div>
                        <div className="resource-languages">
                            {resource.languages.map(lang => (
                                <span key={lang} className="language-badge">{lang}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
        .resource-palette {
          background: var(--sl-color-bg-nav);
          border-right: 1px solid var(--sl-color-gray-5);
          padding: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .back-nav {
          padding: 1rem;
          border-bottom: 1px solid var(--sl-color-gray-5);
          background: var(--sl-color-bg);
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--sl-color-accent);
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 600;
          transition: all 0.2s;
        }

        .back-link:hover {
          color: var(--sl-color-accent-high);
          transform: translateX(-2px);
        }

        .back-icon {
          font-size: 1.25rem;
          line-height: 1;
        }

        .palette-header {
          padding: 1rem;
        }

        .search-box {
          padding: 0 1rem 1rem;
        }

        .category-filter {
          padding: 0 1rem 1rem;
        }

        .resource-list {
          padding: 1rem 1rem 1rem;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .palette-header h3 {
          margin: 0 0 0.25rem 0;
          color: var(--sl-color-white);
          font-size: 1.25rem;
        }

        .palette-header p {
          margin: 0;
          color: var(--sl-color-gray-3);
          font-size: 0.875rem;
        }

        .search-input {
          width: 100%;
          padding: 0.5rem;
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          color: var(--sl-color-white);
          font-size: 0.875rem;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--sl-color-accent);
        }

        .category-filter {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .category-btn {
          padding: 0.5rem 1rem;
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          color: var(--sl-color-gray-2);
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
        }

        .category-btn:hover {
          background: var(--sl-color-gray-6);
          border-color: var(--sl-color-accent);
        }

        .category-btn.active {
          background: var(--sl-color-accent);
          border-color: var(--sl-color-accent);
          color: white;
        }

        .resource-card {
          background: var(--sl-color-bg);
          border: 1px solid var(--sl-color-gray-5);
          border-radius: 6px;
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .resource-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          border-color: var(--sl-color-accent);
        }

        .resource-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .resource-icon {
          font-size: 2rem;
          line-height: 1;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .resource-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .resource-info {
          flex: 1;
        }

        .resource-name {
          font-weight: 600;
          color: var(--sl-color-white);
          font-size: 0.9375rem;
        }

        .resource-category {
          font-size: 0.75rem;
          color: var(--sl-color-gray-3);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .resource-description {
          color: var(--sl-color-gray-2);
          font-size: 0.8125rem;
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }

        .resource-languages {
          display: flex;
          gap: 0.25rem;
          flex-wrap: wrap;
        }

        .language-badge {
          background: var(--sl-color-gray-6);
          color: var(--sl-color-gray-2);
          padding: 0.125rem 0.5rem;
          border-radius: 3px;
          font-size: 0.6875rem;
          font-weight: 500;
        }
      `}</style>
        </div>
    );
};

export default ResourcePalette;
