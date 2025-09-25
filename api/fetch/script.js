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
      message: 'Lua Seel API Online - Blob Storage Connected',
      storage_path: '/scripts/',
      node_version: process.version,
      timestamp: new Date().toISOString()
    });
  }

  // Debug endpoint to check blob storage contents
  if (req.method === 'GET' && req.url?.includes('debug')) {
    try {
      const { blobs } = await list({
        prefix: 'scripts/',
        limit: 20
      });
      
      return res.status(200).json({
        success: true,
        message: 'Debug: Blob storage contents',
        found_scripts: blobs.map(blob => ({
          pathname: blob.pathname,
          filename: blob.pathname.replace('scripts/', ''),
          url: blob.url,
          size: blob.size,
          uploaded: blob.uploadedAt
        })),
        total: blobs.length
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Debug failed: ' + error.message
      });
    }
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
        console.log('📤 Upload attempt:', {
          auth_key,
          script_name,
          code_length: script_code.length
        });

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
          size: script_code.length,
          auth_key
        };
        
        await put(`meta/${auth_key}.json`, JSON.stringify(metadata), {
          access: 'public'
        });

        console.log('✅ Script uploaded successfully:', {
          auth_key,
          blob_url: blob.url,
          storage_path: `scripts/${auth_key}.lua`
        });

        return res.status(200).json({
          success: true,
          message: 'Script uploaded successfully to blob storage',
          script_id,
          api_key,
          auth_key,
          blob_url: blob.url,
          storage_path: `scripts/${auth_key}.lua`
        });

      } catch (error) {
        console.error('❌ Blob storage upload error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to store script in blob storage',
          error: error.message,
          debug: {
            auth_key,
            script_length: script_code?.length || 0
          }
        });
      }
    }

    // Fetch Script from /scripts/ folder - DEBUG VERSION
    if (action === 'fetch_script') {
      if (!auth_key) {
        return res.status(400).json({
          success: false,
          message: 'Missing authentication key'
        });
      }

      try {
        console.log('🔍 DEBUG: Fetch request for auth_key:', auth_key);
        
        // List all scripts in storage to see what actually exists
        const { blobs } = await list({
          prefix: 'scripts/',
          limit: 50
        });
        
        console.log('📁 DEBUG: Scripts in storage:', blobs.map(b => ({
          pathname: b.pathname,
          filename: b.pathname.replace('scripts/', '')
        })));
        
        const expectedPath = `scripts/${auth_key}.lua`;
        console.log('🎯 DEBUG: Looking for:', expectedPath);
        
        // Check if our expected file exists
        const matchingBlob = blobs.find(b => b.pathname === expectedPath);
        
        if (matchingBlob) {
          console.log('✅ DEBUG: Found exact match!', {
            pathname: matchingBlob.pathname,
            url: matchingBlob.url
          });
          
          try {
            const response = await fetch(matchingBlob.url);
            if (response.ok) {
              const script = await response.text();
              
              console.log('✅ DEBUG: Script retrieved successfully:', {
                auth_key,
                script_length: script.length,
                user_data: user_data ? 'present' : 'missing'
              });

              // Log user analytics
              if (user_data) {
                console.log('📊 User analytics:', {
                  auth_key,
                  env: user_data.env,
                  executor: user_data.executor,
                  player_name: user_data.player?.name,
                  timestamp: new Date().toISOString()
                });
              }
              
              return res.status(200).json({
                success: true,
                script: script,
                timestamp: Date.now(),
                debug: {
                  requested: auth_key,
                  found_path: matchingBlob.pathname,
                  script_length: script.length
                }
              });
            } else {
              console.error('❌ DEBUG: Failed to fetch blob content:', response.status, response.statusText);
            }
          } catch (fetchError) {
            console.error('❌ DEBUG: Error fetching blob content:', fetchError);
          }
        }
        
        // If no exact match found, return detailed debug info
        console.log('❌ DEBUG: No exact match found');
        
        return res.status(401).json({
          success: false,
          message: 'Script not found in blob storage',
          debug: {
            requested_auth_key: auth_key,
            expected_path: expectedPath,
            available_scripts: blobs.map(b => ({
              path: b.pathname,
              filename: b.pathname.replace('scripts/', ''),
              size: b.size
            })),
            total_scripts_found: blobs.length,
            search_prefix: 'scripts/'
          }
        });

      } catch (error) {
        console.error('❌ DEBUG: Overall fetch error:', error);
        return res.status(500).json({
          success: false,
          message: 'Script retrieval failed: ' + error.message,
          debug: {
            auth_key,
            error_type: error.name,
            error_message: error.message
          }
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
          
          // Try to get metadata
          let metadata = null;
          try {
            const metaResponse = await fetch(`https://blob.vercel-storage.com/meta/${filename}.json`);
            if (metaResponse.ok) {
              metadata = await metaResponse.json();
            }
          } catch (metaError) {
            // Metadata not found, continue without it
          }
          
          scripts.push({
            auth_key: filename,
            url: blob.url,
            size: blob.size,
            uploaded: blob.uploadedAt,
            metadata: metadata
          });
        }

        return res.status(200).json({
          success: true,
          scripts: scripts,
          total: scripts.length
        });
      } catch (error) {
        console.error('❌ List scripts error:', error);
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
      message: 'Server error: ' + error.message,
      error_type: error.name
    });
  }
}