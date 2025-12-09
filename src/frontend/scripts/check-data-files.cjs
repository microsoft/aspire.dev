#!/usr/bin/env node
/**
 * Safety check script to ensure required data files exist.
 * If data files are missing, runs the update:all script to generate them.
 */
const { existsSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

const REQUIRED_FILES = [
  './src/data/aspire-integrations.json',
  './src/data/github-stats.json'
];

function checkDataFiles() {
  const missingFiles = REQUIRED_FILES.filter(file => {
    const fullPath = join(process.cwd(), file);
    return !existsSync(fullPath);
  });

  if (missingFiles.length > 0) {
    console.log('⚠️  Missing required data files:');
    missingFiles.forEach(file => console.log(`   - ${file}`));
    console.log('\n🔄 Running update:all to generate missing files...\n');
    
    try {
      execSync('npm run update:all', { stdio: 'inherit' });
      console.log('\n✅ Data files generated successfully');
    } catch (error) {
      console.error('\n❌ Failed to generate data files');
      process.exit(1);
    }
  } else {
    console.log('✅ All required data files exist');
  }
}

checkDataFiles();
