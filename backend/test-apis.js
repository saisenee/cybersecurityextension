// Test script to verify API keys and database connections
require('dotenv').config();
const axios = require('axios');

async function testAPIs() {
  console.log('🔍 Testing API Keys and Database Connections\n');
  console.log('=' .repeat(60));
  
  // Check environment variables
  console.log('\n1️⃣ Environment Variables:');
  console.log('   SAFE_BROWSING_API_KEY:', process.env.SAFE_BROWSING_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('   OTX_API_KEY:', process.env.OTX_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('   VIRUSTOTAL_API_KEY:', process.env.VIRUSTOTAL_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('   AI_PROVIDER:', process.env.AI_PROVIDER || 'none');
  
  // Test URLhaus (no key needed)
  console.log('\n2️⃣ Testing URLhaus (no key required):');
  try {
    const testUrl = 'http://malware.wicar.org/data/ms14_064_ole_not_xp.html';
    console.log(`   Testing with known malicious URL: ${testUrl}`);
    const response = await axios.post('https://urlhaus-api.abuse.ch/v1/url/', 
      `url=${encodeURIComponent(testUrl)}`,
      { timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log('   Response status:', response.data.query_status);
    if (response.data.query_status === 'ok') {
      console.log('   ✅ URLhaus is working!');
      console.log('   Threat detected:', response.data.threat || 'N/A');
    } else if (response.data.query_status === 'no_results') {
      console.log('   ⚠️  URLhaus is working but URL not in database');
    }
  } catch (err) {
    console.log('   ❌ URLhaus error:', err.message);
  }

  // Test Google Safe Browsing
  console.log('\n3️⃣ Testing Google Safe Browsing:');
  if (!process.env.SAFE_BROWSING_API_KEY) {
    console.log('   ❌ API key not set');
  } else {
    try {
      const testUrl = 'http://malware.testing.google.test/testing/malware/';
      console.log(`   Testing with Google's test URL: ${testUrl}`);
      const response = await axios.post(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.SAFE_BROWSING_API_KEY}`,
        {
          client: { clientId: 'neurosafe-test', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: testUrl }]
          }
        },
        { timeout: 10000 }
      );
      if (response.data.matches && response.data.matches.length > 0) {
        console.log('   ✅ Google Safe Browsing is working!');
        console.log('   Threat types found:', response.data.matches.map(m => m.threatType).join(', '));
      } else {
        console.log('   ⚠️  API is responding but test URL not detected (this is OK for some APIs)');
      }
    } catch (err) {
      if (err.response) {
        console.log('   ❌ API error:', err.response.status, err.response.data?.error?.message || err.message);
      } else {
        console.log('   ❌ Network error:', err.message);
      }
    }
  }

  // Test OTX (AlienVault)
  console.log('\n4️⃣ Testing OTX (AlienVault):');
  if (!process.env.OTX_API_KEY) {
    console.log('   ❌ API key not set');
  } else {
    try {
      const testDomain = 'malware.com';
      console.log(`   Testing with domain: ${testDomain}`);
      const response = await axios.get(
        `https://otx.alienvault.com/api/v1/indicators/domain/${testDomain}/general`,
        {
          headers: { 'X-OTX-API-KEY': process.env.OTX_API_KEY },
          timeout: 10000
        }
      );
      console.log('   ✅ OTX is working!');
      console.log('   Pulse count:', response.data.pulse_info?.count || 0);
      console.log('   Malware families:', response.data.malware_families?.length || 0);
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log('   ❌ API key is invalid or expired');
      } else if (err.response) {
        console.log('   ❌ API error:', err.response.status, err.message);
      } else {
        console.log('   ❌ Network error:', err.message);
      }
    }
  }

  // Test VirusTotal
  console.log('\n5️⃣ Testing VirusTotal:');
  if (!process.env.VIRUSTOTAL_API_KEY) {
    console.log('   ❌ API key not set');
  } else {
    try {
      const testDomain = 'malware.com';
      console.log(`   Testing with domain: ${testDomain}`);
      const response = await axios.get(
        `https://www.virustotal.com/api/v3/domains/${testDomain}`,
        {
          headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY },
          timeout: 10000
        }
      );
      console.log('   ✅ VirusTotal is working!');
      const stats = response.data.data?.attributes?.last_analysis_stats;
      console.log('   Malicious:', stats?.malicious || 0);
      console.log('   Suspicious:', stats?.suspicious || 0);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('   ❌ API key is invalid');
      } else if (err.response) {
        console.log('   ❌ API error:', err.response.status, err.message);
      } else {
        console.log('   ❌ Network error:', err.message);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Summary:');
  console.log('   • URLhaus: Always available (no key needed)');
  console.log('   • Safe Browsing: Requires Google API key');
  console.log('   • OTX: Requires AlienVault API key');
  console.log('   • VirusTotal: Requires VirusTotal API key');
  console.log('\n💡 Tips:');
  console.log('   • Even without API keys, the extension uses heuristics');
  console.log('   • URLhaus works without keys and catches many threats');
  console.log('   • Get free API keys from the providers for better detection');
  console.log('\n');
}

// Run tests
testAPIs().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
