import { put, list } from '@vercel/blob';
import crypto from 'crypto';

// Simple in-memory session store (in production, use a proper session store)
const activeSessions = new Map();

// Hash password securely
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

// Verify password
function verifyPassword(password, hashedPassword) {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return hash === verifyHash;
}

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Initialize admin user if not exists
async function initializeAdmin() {
  try {
    const adminExists = await list({ prefix: 'users/daveblunts' });
    if (adminExists.blobs.length === 0) {
      const adminUser = {
        username: 'daveblunts',
        password: hashPassword('escolar112200),
        role: 'admin',
        created: new Date().toISOString()
      };
      
      await put('users/daveblunts.json', JSON.stringify(adminUser), { access: 'public' });
      console.log('✓ Admin user initialized');
    }
  } catch (error) {
    console.error('Failed to initialize admin:', error);
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Initialize admin on first request
  if (req.method === 'GET' && !req.url?.includes('debug')) {
    await initializeAdmin();
  }

  // Handle GET requests (browser visits)
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'LuaSeel API Online - Authentication Enabled',
      storage_path: '/scripts/',
      node_version: process.version,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { action } = req.body || {};

    // Authentication endpoints
    if (action === 'login') {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password required'
        });
      }

      try {
        // Get user from blob storage
        const userBlobs = await list({ prefix: `users/${username}` });
        if (userBlobs.blobs.length === 0) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }

        const userResponse = await fetch(userBlobs.blobs[0].url);
        const userData = await userResponse.json();
        
        if (verifyPassword(password, userData.password)) {
          const sessionToken = generateSessionToken();
          activeSessions.set(sessionToken, {
            username: userData.username,
            role: userData.role,
            created: Date.now()
          });

          console.log('✓ User logged in:', username);
          
          return res.status(200).json({
            success: true,
            message: 'Login successful',
            session_token: sessionToken,
            role: userData.role,
            username: userData.username
          });
        } else {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }
      } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
          success: false,
          message: 'Login failed'
        });
      }
    }

    if (action === 'create_user') {
      const { session_token, new_username, new_password, new_role } = req.body;
      
      // Verify admin session
      const session = activeSessions.get(session_token);
      if (!session || session.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      if (!new_username || !new_password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password required'
        });
      }

      try {
        // Check if user already exists
        const existingUser = await list({ prefix: `users/${new_username}` });
        if (existingUser.blobs.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'User already exists'
          });
        }

        const newUser = {
          username: new_username,
          password: hashPassword(new_password),
          role: new_role || 'user',
          created: new Date().toISOString(),
          created_by: session.username
        };

        await put(`users/${new_username}.json`, JSON.stringify(newUser), { access: 'public' });
        
        console.log('✓ User created:', new_username, 'by', session.username);
        
        return res.status(200).json({
          success: true,
          message: 'User created successfully',
          username: new_username,
          role: newUser.role
        });
      } catch (error) {
        console.error('Create user error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create user'
        });
      }
    }

    if (action === 'verify_session') {
      const { session_token } = req.body;
      const session = activeSessions.get(session_token);
      
      if (session) {
        return res.status(200).json({
          success: true,
          valid: true,
          username: session.username,
          role: session.role
        });
      } else {
        return res.status(200).json({
          success: true,
          valid: false
        });
      }
    }

    if (action === 'logout') {
      const { session_token } = req.body;
      activeSessions.delete(session_token);
      
      return res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    }

    // Protected endpoints - require authentication
    const { session_token } = req.body;
    const session = activeSessions.get(session_token);
    
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Rest of your existing endpoints (upload_script, fetch_script, etc.)
    const { auth_key, user_data, script_data } = req.body;

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
        console.log('📤 Upload attempt by:', session.username, {
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
          auth_key,
          uploaded_by: session.username
        };
        
        await put(`meta/${auth_key}.json`, JSON.stringify(metadata), {
          access: 'public'
        });

        console.log('✅ Script uploaded successfully by', session.username, ':', {
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

    // Fetch Script from /scripts/ folder (public - no auth required for script execution)
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
      message: 'Invalid action'
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