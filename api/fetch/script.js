import { put, head, list } from '@vercel/blob';

export default async function handler(req, res) {
  // Enable CORS for website
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { auth_key, user_data, action, script_data } = req.body;

    // Upload Script Endpoint
    if (action === 'upload_script') {
      const { script_id, api_key, script_code, script_name, description } = script_data;
      
      if (!script_id || !api_key || !script_code) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // Store script in Blob storage
      const auth_key = `${script_id}_${api_key}_fetch`;
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

      // Log upload
      console.log('📤 Script uploaded to Blob:', {
        auth_key,
        name: script_name,
        size: script_code.length + ' characters',
        url: blob.url
      });

      return res.status(200).json({
        success: true,
        message: 'Script uploaded successfully',
        script_id,
        api_key,
        auth_key,
        blob_url: blob.url
      });
    }

    // Fetch Script Endpoint
    if (action === 'fetch_script') {
      if (!auth_key) {
        return res.status(400).json({
          success: false,
          message: 'Missing authentication key'
        });
      }

      try {
        // Fetch script from Blob storage
        const response = await fetch(`${process.env.BLOB_READ_WRITE_TOKEN ? 'https://' + process.env.VERCEL_URL : 'https://blob.vercel-storage.com'}/scripts/${auth_key}.lua`);
        
        if (!response.ok) {
          return res.status(401).json({
            success: false,
            message: 'Invalid authentication key'
          });
        }

        const script = await response.text();

        // Log user analytics
        console.log('📊 Script accessed:', {
          auth_key,
          user_data: JSON.stringify(user_data),
          timestamp: new Date().toISOString(),
          script_size: script.length
        });

        // Store analytics
        const analytics = {
          user_data,
          timestamp: new Date().toISOString(),
          script_id: auth_key.split('_')[0],
          script_size: script.length
        };
        
        await put(`analytics/${auth_key}_${Date.now()}.json`, JSON.stringify(analytics), {
          access: 'public'
        });

        return res.status(200).json({
          success: true,
          script: script,
          timestamp: Date.now()
        });

      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Script not found or access denied'
        });
      }
    }

    // List Scripts Endpoint (for management)
    if (action === 'list_scripts') {
      try {
        const { blobs } = await list({
          prefix: 'scripts/',
          limit: 100
        });
        
        const scripts = [];
        
        for (const blob of blobs) {
          try {
            const filename = blob.pathname.replace('scripts/', '').replace('.lua', '');
            const metaResponse = await fetch(`${blob.url.replace('/scripts/', '/meta/').replace('.lua', '.json')}`);
            
            if (metaResponse.ok) {
              const meta = await metaResponse.json();
              scripts.push({
                auth_key: filename,
                url: blob.url,
                ...meta
              });
            }
          } catch (e) {
            // Skip if metadata not found
          }
        }

        return res.status(200).json({
          success: true,
          scripts: scripts
        });
      } catch (error) {
        return res.status(200).json({
          success: true,
          scripts: []
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action'
    });

  } catch (error) {
    console.error('❌ Blob storage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Storage error: ' + error.message
    });
  }
}