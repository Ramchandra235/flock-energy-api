import env from '../src/config/env.js';
import urjaClient from '../src/clients/urjaClient.js';
import meterService from '../src/services/meterService.js';

async function runLiveVerification() {
  console.log('====================================================');
  console.log('🧪 LIVE PORTAL INTEGRATION VERIFICATION');
  console.log(`📡 Target Portal: ${env.URJA_BASE_URL}`);
  console.log(`👤 Username     : ${env.URJA_USERNAME}`);
  console.log('====================================================\n');

  try {
    // 1. Verify Authentication
    process.stdout.write('1. Testing upstream login & session cookie establishment... ');
    await urjaClient.login();
    if (urjaClient.isAuthenticated) {
      console.log('✅ SUCCESS (Session established)');
    } else {
      console.log('❌ FAILED');
      process.exit(1);
    }

    // 2. Verify Meter Listing
    process.stdout.write('2. Testing meter search endpoint (/portal/meters/search)... ');
    const listResult = await meterService.listMeters({ q: '', page: 1 });
    if (listResult.meters.length > 0 && listResult.pagination.total > 0) {
      console.log(`✅ SUCCESS (Found ${listResult.pagination.total} total meters, page 1 count: ${listResult.meters.length})`);
    } else {
      console.log('❌ FAILED (Empty meter list)');
      process.exit(1);
    }

    // 3. Verify Meter Details (Legacy format: J100000)
    process.stdout.write('3. Testing legacy meter detail retrieval (J100000)... ');
    const meterLegacy = await meterService.getMeterById('J100000');
    if (meterLegacy && meterLegacy.meter_id === 'J100000') {
      console.log(`✅ SUCCESS (Make: ${meterLegacy.make}, Status: ${meterLegacy.status}, DT: ${meterLegacy.hierarchy.dt.name})`);
    } else {
      console.log('❌ FAILED');
      process.exit(1);
    }

    // 4. Verify Meter Details (v2 format: J100004)
    process.stdout.write('4. Testing v2 meter detail retrieval (J100004)... ');
    const meterV2 = await meterService.getMeterById('J100004');
    if (meterV2 && meterV2.meter_id === 'J100004') {
      console.log(`✅ SUCCESS (Make: ${meterV2.make}, Status: ${meterV2.status}, Type: ${meterV2.installation_type})`);
    } else {
      console.log('❌ FAILED');
      process.exit(1);
    }

    // 5. Verify Meter Consumption
    process.stdout.write('5. Testing meter consumption history (/portal/meters/J100000/energy)... ');
    const consumption = await meterService.getMeterConsumption('J100000');
    if (consumption && consumption.readings.length > 0) {
      console.log(`✅ SUCCESS (${consumption.readings.length} readings normalized, latest kWh: ${consumption.readings[0].kwh})`);
    } else {
      console.log('❌ FAILED');
      process.exit(1);
    }

    // 6. Verify HMAC Export & Hierarchy Reconstruction
    process.stdout.write('6. Testing HMAC signed export & network hierarchy reconstruction... ');
    const hierarchy = await meterService.getNetworkHierarchy({ forceRefresh: true });
    if (hierarchy && hierarchy.total_meters_indexed > 0) {
      console.log(`✅ SUCCESS (${hierarchy.total_meters_indexed} meters indexed across ${hierarchy.total_zones} zones)`);
    } else {
      console.log('❌ FAILED');
      process.exit(1);
    }

    // 7. Verify 404 handling
    process.stdout.write('7. Testing non-existent meter ID handling (NONEXISTENT)... ');
    const notFound = await meterService.getMeterById('NONEXISTENT');
    if (notFound === null) {
      console.log('✅ SUCCESS (Clean null returned for 404)');
    } else {
      console.log('❌ FAILED');
      process.exit(1);
    }

    console.log('\n🎉 ALL LIVE UPSTREAM VERIFICATION CHECKS PASSED PERFECTLY!\n');
  } catch (err) {
    console.error('\n❌ Verification encountered an error:', err.message);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
    process.exit(1);
  }
}

runLiveVerification();
