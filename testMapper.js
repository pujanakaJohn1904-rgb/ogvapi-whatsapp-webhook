const { getTemplateName } = require('./templateMapper');

function runTests() {
  const cases = [
    { input: 'Reefer unit failure', expected: 'reefer_repair_alert_v1' },
    { input: 'REEFER breakdown', expected: 'reefer_repair_alert_v1' },
    { input: 'Flat tire on highway', expected: 'otr_tire_alert_v1' },
    { input: 'OTR tire replacement needed', expected: 'otr_tire_alert_v1' },
    { input: 'Hydraulic leak in lift gate', expected: 'hydraulic_repair_alert_v1' },
    { input: 'Engine failure', expected: 'diesel_fleet_alert_v1' },
    { input: '', expected: 'diesel_fleet_alert_v1' },
    { input: null, expected: 'diesel_fleet_alert_v1' },
  ];

  let passed = 0;
  console.log('Running Template Mapping Tests...\n');

  cases.forEach(({ input, expected }, idx) => {
    const actual = getTemplateName(input);
    if (actual === expected) {
      console.log(`[PASS] Test ${idx + 1}: input="${input}" -> "${actual}"`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${idx + 1}: input="${input}" -> expected "${expected}", got "${actual}"`);
    }
  });

  console.log(`\nResults: ${passed}/${cases.length} passed.`);
  if (passed !== cases.length) process.exit(1);
}

runTests();
