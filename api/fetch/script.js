import { put, list } from '@vercel/blob';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests (browser visits)
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Lua Seel API is online',
      endpoints: {
        upload: 'POST /api/fetch/script with action: upload_script',
        fetch: 'POST /api/fetch/script with action: fetch_script'
      }
    });
  }

  try {
    // Handle missing or invalid body
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: 'Request body required'
      });
    }

    const { auth_key, user_data, action, script_data } = req.body;

    // Upload Script
    if (action === 'upload_script') {
      const { script_id, api_key, script_code, script_name, description } = script_data || {};
      
      if (!script_id || !api_key || !script_code) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: script_id, api_key, script_code'
        });
      }

      const auth_key = `${script_id}_${api_key}_fetch`;
      
      try {
        // Store script in Blob storage
        const blob = await put(`scripts/${auth_key}.lua`, script_code, {
          access: 'public'
        });
        
        // Store metadata
        const metadata = {
          name: script_name || 'Untitled Script',
          description: description || '',
          created: new Date().toISOString(),
          script_id,
          api_key,
          size: script_code.length
        };
        
        await put(`meta/${auth_key}.json`, JSON.stringify(metadata), {
          access: 'public'
        });

        console.log('✓ Script uploaded:', auth_key, script_code.length + ' chars');

        return res.status(200).json({
          success: true,
          message: 'Script uploaded successfully',
          script_id,
          api_key,
          auth_key,
          blob_url: blob.url
        });
      } catch (error) {
        console.error('Blob storage error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to store script: ' + error.message
        });
      }
    }

    // Fetch Script
    if (action === 'fetch_script') {
      if (!auth_key) {
        return res.status(400).json({
          success: false,
          message: 'Missing authentication key'
        });
      }

      try {
        // Get script from Blob storage using Vercel's blob URL pattern
        const scriptUrl = `https://blob.vercel-storage.com/scripts/${auth_key}.lua`;
        const response = await fetch(scriptUrl);
        
        if (!response.ok) {
          console.error('Script fetch failed:', response.status, response.statusText);
          return res.status(401).json({
            success: false,
            message: 'Invalid authentication key or script not found'
          });
        }

        const script = await response.text();

        // Log analytics
        console.log('✓ Script accessed:', {
          auth_key,
          user_data: JSON.stringify(user_data || {}),
          script_size: script.length
        });

        return res.status(200).json({
          success: true,
          script: script,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('Script fetch error:', error);
        return res.status(401).json({
          success: false,
          message: 'Script not found or access denied'
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