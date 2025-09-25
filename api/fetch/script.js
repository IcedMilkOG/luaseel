import { put, list } from '@vercel/blob';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Lua Seel API is online - Blob Storage Connected',
      storage_path: '/scripts/'
    });
  }

  try {
    const { auth_key, user_data, action, script_data } = req.body || {};

    // Upload Script to /scripts/ folder
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
        // Store script in /scripts/ folder in Blob storage
        const blob = await put(`scripts/${auth_key}.lua`, script_code, {
          access: 'public'
        });
        
        // Store metadata in /meta/ folder
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

        console.log('✓ Script uploaded to /scripts/:', auth_key, script_code.length + ' chars');

        return res.status(200).json({
          success: true,
          message: 'Script uploaded successfully to /scripts/',
          script_id,
          api_key,
          auth_key,
          blob_url: blob.url,
          storage_path: `scripts/${auth_key}.lua`
        });
      } catch (error) {
        console.error('Blob storage error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to store script: ' + error.message
        });
      }
    }

    // Fetch Script from /scripts/ folder
    if (action === 'fetch_script') {
      if (!auth_key) {
        return res.status(400).json({
          success: false,
          message: 'Missing authentication key'
        });
      }

      try {
        // Fetch from /scripts/ folder using multiple URL patterns
        const scriptPath = `scripts/${auth_key}.lua`;
        const possibleUrls = [
          `https://blob.vercel-storage.com/${scriptPath}`,
          `${process.env.VERCEL_BLOB_STORE_URL || 'https://blob.vercel-storage.com'}/${scriptPath}`
        ];

        console.log('🔍 Fetching script from /scripts/:', auth_key);

        for (const url of possibleUrls) {
          try {
            console.log('🌐 Trying URL:', url);
            const response = await fetch(url);
            
            if (response.ok) {
              const script = await response.text();
              console.log('✅ Script found in /scripts/!', script.length + ' chars');

              // Log user analytics
              console.log('📊 Script accessed:', {
                auth_key,
                user_data: JSON.stringify(user_data || {}),
                script_size: script.length
              });

              return res.status(200).json({
                success: true,
                script: script,
                timestamp: Date.now(),
                source_path: scriptPath
              });
            } else {
              console.log('❌ URL failed:', response.status, response.statusText);
            }
          } catch (fetchError) {
            console.log('❌ Fetch error:', fetchError.message);
          }
        }

        // If direct URLs failed, try using Blob list API as fallback
        try {
          console.log('🔄 Fallback: Using Blob list API...');
          const { blobs } = await list({
            prefix: `scripts/${auth_key}`
          });
          
          if (blobs.length > 0) {
            const blob = blobs[0];
            const response = await fetch(blob.url);
            
            if (response.ok) {
              const script = await response.text();
              console.log('✅ Script found via Blob API!', script.length + ' chars');
              
              return res.status(200).json({
                success: true,
                script: script,
                timestamp: Date.now(),
                source_method: 'blob_api'
              });
            }
          }
        } catch (listError) {
          console.error('Blob list API error:', listError);
        }

        return res.status(401).json({
          success: false,
          message: 'Script not found in /scripts/ folder',
          debug: {
            auth_key,
            searched_path: scriptPath,
            attempted_urls: possibleUrls
          }
        });

      } catch (error) {
        console.error('Script fetch error:', error);
        return res.status(401).json({
          success: false,
          message: 'Script retrieval failed: ' + error.message
        });
      }
    }

    // List Scripts (for management)
    if (action === 'list_scripts') {
      try {
        const { blobs } = await list({
          prefix: 'scripts/',
          limit: 100
        });
        
        const scripts = [];
        for (const blob of blobs) {
          const filename = blob.pathname.replace('scripts/', '').replace('.lua', '');
          scripts.push({
            auth_key: filename,
            url: blob.url,
            size: blob.size,
            uploaded: blob.uploadedAt
          });
        }

        return res.status(200).json({
          success: true,
          scripts: scripts,
          total: scripts.length
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Failed to list scripts: ' + error.message
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use: upload_script, fetch_script, or list_scripts'
    });

  } catch (error) {
    console.error('❌ API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
}