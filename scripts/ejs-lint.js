const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

function getFiles(dir, allFiles) {
    const files = fs.readdirSync(dir);
    allFiles = allFiles || [];
    files.forEach(function (file) {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) {
            getFiles(name, allFiles);
        } else if (name.endsWith('.ejs')) {
            allFiles.push(name);
        }
    });
    return allFiles;
}

async function lintEjs() {
    const viewsPath = path.join(process.cwd(), 'views');
    if (!fs.existsSync(viewsPath)) {
        console.error("Views directory not found at " + viewsPath);
        process.exit(1);
    }
    const files = getFiles(viewsPath);

    console.log(`Checking ${files.length} EJS files in ${viewsPath}...\n`);
    let errorCount = 0;

    for (const fullPath of files) {
        const relativePath = path.relative(viewsPath, fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');

        try {
            ejs.compile(content, { filename: fullPath });
        } catch (err) {
            errorCount++;
            console.log(`❌ ${relativePath}`);
            console.log(`   Error: ${err.message}`);
            process.exitCode = 1;
            console.log('---');
        }
    }

    if (errorCount === 0) {
        console.log('\n✅ All EJS files are syntactically correct.');
    } else {
        console.log(`\nFound ${errorCount} file(s) with errors.`);
    }
}

lintEjs().catch(err => {
    console.error(err);
    process.exit(1);
});
