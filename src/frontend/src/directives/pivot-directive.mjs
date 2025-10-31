export function pivotDirective() {
    return function transformer(tree, file) {        
        let foundDirectives = 0;
        
        function walk(node) {
            if (!node) return;
            
            // Check if this is a pivot directive
            if (node.type === "containerDirective" &&
                node.name === "pivot") {
                foundDirectives++;
                const id = node.attributes?.id || "csharp";
                
                // Set the HTML properties
                const data = node.data || (node.data = {});
                data.hName = "div";
                data.hProperties = { "data-pivot-block": id };
            }
            
            // Recursively walk children
            if (node.children && Array.isArray(node.children)) {
                for (const child of node.children) {
                    walk(child);
                }
            }
        }
        
        walk(tree);
    };
}