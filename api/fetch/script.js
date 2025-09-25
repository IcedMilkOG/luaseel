import { put } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Lua Seel API Online - Blob Storage Active'
    });
  }

  try {
    const { auth_key, user_data, action, script_data } = req.body || {};

    // Upload Script to Blob
    if (action === 'upload_script') {
      const { script_id, api_key, script_code, script_name } = script_data || {};
      
      if (!script_id || !api_key || !script_code) {
        return res.status(400).json({
          success: false,
          message: 'Missing: script_id, api_key, or script_code'
        });
      }

      const auth_key = `${script_id}_${api_key}_fetch`;
      
      try {
        // Store in Blob storage
        const blob = await put(`${auth_key}.lua`, script_code, {
          access: 'public'
        });
        
        console.log('✓ Blob stored:', auth_key, blob.url);

        return res.status(200).json({
          success: true,
          message: 'Script uploaded to Blob storage',
          auth_key,
          blob_url: blob.url
        });
      } catch (blobError) {
        console.error('Blob storage error:', blobError);
        return res.status(500).json({
          success: false,
          message: 'Blob storage failed: ' + blobError.message
        });
      }
    }

    // Fetch Script from Blob
    if (action === 'fetch_script') {
      if (!auth_key) {
        return res.status(400).json({
          success: false,
          message: 'Missing auth_key'
        });
      }

      try {
        // Try to fetch from Blob storage
        const blobUrl = `${process.env.BLOB_READ_WRITE_TOKEN ? 
          process.env.VERCEL_BLOB_STORE_URL || 'https://blob.vercel-storage.com' : 
          'https://blob.vercel-storage.com'}/${auth_key}.lua`;
          
        console.log('Fetching from:', blobUrl);
        
        const response = await fetch(blobUrl);
        
        if (!response.ok) {
          console.error('Blob fetch failed:', response.status);
          return res.status(401).json({
            success: false,
            message: 'Script not found in Blob storage'
          });
        }

        const script = await response.text();
        
        console.log('✓ Script retrieved:', auth_key, script.length + ' chars');

        return res.status(200).json({
          success: true,
          script: script,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('Blob retrieval error:', error);
        return res.status(401).json({
          success: false,
          message: 'Failed to retrieve script: ' + error.message
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use: upload_script or fetch_script'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
}