const { dest, series, src, task } = require('gulp');
const ts = require('gulp-typescript');
const fs = require('fs');
const path = require('path');
const log = require('fancy-log');
const { spawn } = require('child_process');

let asVersion = null;

task('determine_version', (cb) => {
    const { AS_VERSION } = process.env;
    if (!AS_VERSION) {
        log('No version set via environment variables, this is not a release build');
        cb();
        return;
    }
    const match = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(AS_VERSION);
    if (!match) {
        log.error(`Given value for environment variable AS_VERSION does not contain a valid version string: "${AS_VERSION}", this is not a release build`);
        cb();
        return;
    }
    asVersion = {
        major: Number.parseInt(match[1]),
        minor: Number.parseInt(match[2]),
        patch: Number.parseInt(match[3]),
    };
    log(`Detected version ${asVersion.major}.${asVersion.minor}.${asVersion.patch}`);
    cb();
});

task('compile', function () {
    const tsProject = ts.createProject('tsconfig.json');
    return src('src/**/*.ts')
        .pipe(tsProject())
        .pipe(dest('dist/lib'));
});

task('package_json', async () => {
    const packageJson = await fs.promises.readFile('package.json', { encoding: 'utf8' }).then(JSON.parse);

    delete packageJson.scripts;
    delete packageJson.devDependencies;
    delete packageJson.resolutions;

    packageJson.main = 'lib/index.js';
    packageJson.typings = 'lib/index.d.ts';
    packageJson.files = [
        'lib/**',
        'LICENSE',
        'README',
    ];

    if (asVersion) {
        const version = `${asVersion.major}.${asVersion.minor}.${asVersion.patch}`;
        log(`Using release version number ${version}`);
        packageJson.version = version;
    }

    await fs.promises.writeFile(path.join('dist', 'package.json'), JSON.stringify(packageJson, null, 2), { encoding: 'utf8' });
});

task('readme', function(cb) {
    fs.copyFileSync('README.MD', 'dist/README.MD');
    fs.copyFileSync('LICENSE', 'dist/LICENSE');
    cb();
});

async function packageJsonContainsVersion(path, expectedVersion) {
    const pjson = await fs.promises.readFile(path, { encoding: 'utf8' }).then(JSON.parse);
    const pjsonVersion = `${pjson.version}`;
    if (pjsonVersion !== expectedVersion) {
        throw new Error(`${path} contains wrong version "${pjsonVersion}", expected "${expectedVersion}"`);
    }
}

task('check_package_json_version', async () => {
    if (!asVersion) {
        log('Not a release build, skipping check');
        return;
    }
    const expectedVersion = `${asVersion.major}.${asVersion.minor}.${asVersion.patch}`;
    await packageJsonContainsVersion(path.resolve('package.json'), expectedVersion);
    await packageJsonContainsVersion(path.resolve('dist', 'package.json'), expectedVersion);
});

task('npm_publish', (cb) => {
    if (!asVersion) {
        log('Not a release build, skipping publication');
        cb();
        return;
    }
    const { NPM_ACCESS_TOKEN } = process.env;
    if (!NPM_ACCESS_TOKEN) {
        log.error('No NPM access token set via environment variables');
        cb('No NPM_ACCESS_TOKEN set');
        return;
    }
    const { stdout, stderr, on } = spawn('npm', ['publish', '--access', 'public'], {
        cwd: path.resolve('dist'),
        shell: true,
        env: process.env,
    });
    stdout.on('data', (data) => log(`${data}`));
    stderr.on('data', (data) => log.error(`${data}`));
    on('exit', (code) => code === 0 ? cb() : cb(code));
});

task('build', series([
    'determine_version',
    'compile',
    'package_json',
    'readme',
]));

task('validate', series([
    'determine_version',
    'check_package_json_version',
]));

task('publish', series([
    'determine_version',
    'validate',
    'npm_publish',
]));

task('default', series([
    'build',
    'validate',
]));
