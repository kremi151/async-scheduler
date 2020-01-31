void setBuildStatus(String message, String state) {
	step([
		$class: "GitHubCommitStatusSetter",
		reposSource: [$class: "ManuallyEnteredRepositorySource", url: env.GIT_URL],
		commitShaSource: [$class: "ManuallyEnteredShaSource", sha: env.GIT_COMMIT],
		contextSource: [$class: "ManuallyEnteredCommitContextSource", context: "ci/jenkins/build-status"],
		errorHandlers: [[$class: "ChangingBuildStatusErrorHandler", result: "UNSTABLE"]],
		statusResultSource: [ $class: "ConditionalStatusResultSource", results: [[$class: "AnyBuildResult", message: message, state: state]] ]
	]);
}

def ciBuildVersion = null
def isFullRelease = false

def readPackageJsonVersion(packageJsonPath) {
	def json = readJSON file: packageJsonPath
	return json['version'].trim()
}

def packageJsonContainsVersion(packageJsonPath, expectedVersion) {
	def actualVersion = readPackageJsonVersion(packageJsonPath)
	return "${actualVersion}" == "${expectedVersion}"
}

pipeline {
	agent any
	stages {
		stage('Notify GitHub') {
			steps {
				setBuildStatus('Build is pending', 'PENDING')
			}
		}
		stage('Determine version') {
			steps {
				script {
					def lastTag = sh(returnStdout: true, script: 'git tag --sort version:refname | tail -1')
					if (lastTag ==~ /^v[0-9]+\.[0-9]+\.[0-9]+$/) {
						ciBuildVersion = lastTag.trim().substring(1)
						echo "Got version to build from last Git tag: ${ciBuildVersion}"
					} else {
						echo "Invalid build version found from last Git tag: ${lastTag}"
						ciBuildVersion = readPackageJsonVersion('package.json')
						echo "Got version to build from package.json: ${ciBuildVersion}"
					}
					if (ciBuildVersion == null || !(ciBuildVersion ==~ /^[0-9]+\.[0-9]+\.[0-9]+$/)) {
						error("Invalid CI build version: ${ciBuildVersion}")
					}
				}
			}
		}
		stage('Install') {
			steps {
				sh 'yarn install'
			}
		}
		stage('Build') {
			environment {
				CI_BUILD_VERSION = "${ciBuildVersion}"
			}
			steps {
				sh 'yarn build'
			}
		}
		stage('Test') {
			steps {
				sh 'yarn test-jenkins'
			}
		}
		stage('Validation') {
			steps {
				script {
					def exactTag = sh(returnStdout: true, script: 'git describe --exact-match --tags HEAD || true')
					def expectedVersion = ciBuildVersion
					if (exactTag ==~ /^v[0-9]+\.[0-9]+\.[0-9]+$/) {
						expectedVersion = exactTag.substring(1)
						isFullRelease = true
					} else {
						echo "This is no full release"
						isFullRelease = false
					}
					
					if (!packageJsonContainsVersion('package.json', "${expectedVersion}")) {
						def msg = "Development package JSON file at package.json does not contain expected version ${expectedVersion}"
						if (isFullRelease) {
							error("${msg}")
						} else {
							echo "${msg}"
							currentBuild.result = 'UNSTABLE'
						}
					}

					if (!packageJsonContainsVersion('dist/package.json', "${expectedVersion}")) {
						error("Distributable package JSON file at dist/package.json does not contain expected version ${expectedVersion}")
					}
				}
			}
		}
		stage('Bundling') {
			steps {
				sh 'rm -rf bundle'
				sh 'mkdir bundle'
				dir('dist') {
					sh "zip -r ../bundle/async-scheduler-${ciBuildVersion}.zip ./**"
				}
			}
		}
	}
	post {
		always {
			archiveArtifacts artifacts: 'bundle/*.zip', onlyIfSuccessful: true
			junit 'build/test-results/test/*.xml'
		}
		success {
			setBuildStatus('Build succeeded', 'SUCCESS')
		}
		failure {
			setBuildStatus('Build failed', 'FAILURE')
		}
		unstable {
			setBuildStatus('Build is unstable', 'UNSTABLE')
		}
	}
}
