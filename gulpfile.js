const { dest, series, src, task } = require('gulp');
const ts = require('gulp-typescript');
const fs = require('fs');
const log = require('fancy-log');

task('build', function () {
    const tsProject = ts.createProject('tsconfig.json');
    return src('src/**/*.ts')
        .pipe(tsProject())
        .pipe(dest('dist/lib'));
});

task('package_json', function(cb) {
    const packageJsonContent = fs.readFileSync('package.json', { encoding: 'utf8' });
    let packageJson = JSON.parse(packageJsonContent);

    delete packageJson.scripts;
    delete packageJson.devDependencies;
    delete packageJson.resolutions;

    packageJson.main = 'lib/index.js';
    packageJson.typings = 'lib/index.d.ts';

    const ciVersion = process.env.CI_BUILD_VERSION;
    if (ciVersion) {
        log(`Using custom version number ${ciVersion}`);
        packageJson.version = ciVersion;
    }

    fs.writeFileSync('dist/package.json', JSON.stringify(packageJson, null, 2), { encoding: 'utf8' });
    cb();
});

task('readme', function(cb) {
    fs.copyFileSync('README.MD', 'dist/README.MD');
    fs.copyFileSync('LICENSE', 'dist/LICENSE');
    cb();
});

task('default', series(['build', 'package_json', 'readme']));