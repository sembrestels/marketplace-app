module.exports = {
  norpc: true,
  copyPackages: [
    '@aragon/os',
    '@aragon/contract-helpers-test',
    '@aragon/minime',
    '@aragon/apps-token-manager',
    '@aragon/apps-vault',
    '@1hive/apps-marketplace-shared-interfaces',
    '@1hive/apps-marketplace-shared-test-helpers',
  ],
  skipFiles: [
    'test',
    '@aragon/os',
    '@aragon/contract-helpers-test',
    '@aragon/minime',
    '@aragon/apps-token-manager',
    '@aragon/apps-vault',
    '@1hive/apps-marketplace-shared-interfaces',
    '@1hive/apps-marketplace-shared-test-helpers',
  ],
}
