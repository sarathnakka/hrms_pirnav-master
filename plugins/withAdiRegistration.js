const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const source = path.join(
        config.modRequest.projectRoot,
        'assets',
        'adi-registration.properties'
      );

      if (!fs.existsSync(source)) {
        throw new Error(`Android Developer Verification asset is missing: ${source}`);
      }

      const destinationDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets'
      );

      fs.mkdirSync(destinationDir, { recursive: true });
      fs.copyFileSync(source, path.join(destinationDir, 'adi-registration.properties'));

      return config;
    },
  ]);
};
