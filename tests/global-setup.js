// Преди тестовете: празна папка за поръчките на тестовия сървър (иначе се трупат от предишни пускания)
const fs = require('fs');
const path = require('path');

module.exports = () => {
  fs.rmSync(path.join(__dirname, '..', '.data', 'test-orders'), { recursive: true, force: true });
};
