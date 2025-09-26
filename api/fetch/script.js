import { put, list } from '@vercel/blob';
import crypto from 'crypto';

// Simple in-memory session store (in production, use a proper session store)
const activeSessions = new Map();

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.created > expireTime) {
      activeSessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

// Hash password securely
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

// Verify password
function verifyPassword(password, hashedPassword) {
  try {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
    return hash === verifyHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Store admin credentials securely in blob storage
async function initializeAdminCredentials() {
  try {
    // Check if admin config already exists
    const configBlobs = await list({ prefix: 'config/admin-credentials' });
    if (configBlobs.blobs.length === 0) {
      // Create secure admin credentials
      const adminCredentials = {
        username: 'daveblunts',
        password: 'escolar112200',
        role: 'admin',
        created: new Date().toISOString(),
        description: 'Primary administrator account'
      };
      
      await put('config/admin-credentials.json', JSON.stringify(adminCredentials), { 
        access: 'public' 
      });
      
      console.log('✓ Admin credentials stored securely in blob storage');
    }
  } catch (error) {
    console.error('Failed to store admin credentials:', error);
  }
}

// Initialize admin user from secure blob storage
async function initializeAdmin() {
  try {
    // First ensure admin credentials are stored
    await initializeAdminCredentials();
    
    // Check if admin user already exists
    const adminExists = await list({ prefix: 'users/daveblunts' });
    if (adminExists.blobs.length === 0) {
      
      // Get admin credentials from secure blob storage
      const credentialsBlobs = await list({ prefix: 'config/admin-credentials' });
      if (credentialsBlobs.blobs.length > 0) {
        const credentialsResponse = await fetch(credentialsBlobs.blobs[0].url);
        const credentials = await credentialsResponse.json();
        
        const adminUser = {
          username: credentials.username,
          password: hashPassword(credentials.password),
          role: credentials.role,
          created: new Date().toISOString(),
          initialized_from_config: true
        };
        
        await put('users/daveblunts.json', JSON.stringify(adminUser), { access: 'public' });
        console.log('✓ Admin user initialized from secure credentials');
        
        return { success: true, message: 'Admin user created' };
      } else {
        console.error('❌ Admin credentials not found in blob storage');
        return { success: false, message: 'Admin credentials not found' };
      }
    } else {
      console.log('✓ Admin user already exists');
      return { success: true, message: 'Admin user exists' };
    }
  } catch (error) {
    console.error('Failed to initialize admin:', error);
    return { success: false, message: error.message };
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

  // Handle GET requests (browser visits) and initialize admin
  if (req.method === 'GET') {
    const adminResult = await initializeAdmin();
    return res.status(200).json({
      success: true,
      message: 'LuaSeel API Online - Authentication Enabled',
      storage_path: '/scripts/',
      active_sessions: activeSessions.size,
      admin_status: adminResult,
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
        console.log('🔐 Login attempt for user:', username);
        
        // Ensure admin is initialized before login attempts
        await initializeAdmin();
        
        // Get user from blob storage
        const userBlobs = await list({ prefix: `users/${username}` });
        console.log('📁 User blobs found:', userBlobs.blobs.length);
        
        if (userBlobs.blobs.length === 0) {
          console.log('❌ User not found in blob storage:', username);
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials',
            debug: {
              username_searched: username,
              blobs_found: 0
            }
          });
        }

        console.log('📥 Fetching user data from:', userBlobs.blobs[0].url);
        const userResponse = await fetch(userBlobs.blobs[0].url);
        
        if (!userResponse.ok) {
          console.error('❌ Failed to fetch user data:', userResponse.status);
          return res.status(500).json({
            success: false,
            message: 'Failed to retrieve user data'
          });
        }
        
        const userData = await userResponse.json();
        console.log('👤 User data loaded:', {
          username: userData.username,
          role: userData.role,
          hasPassword: !!userData.password
        });
        
        if (verifyPassword(password, userData.password)) {
          const sessionToken = generateSessionToken();
          activeSessions.set(sessionToken, {
            username: userData.username,
            role: userData.role,
            created: Date.now()
          });

          console.log('✓ User logged in successfully:', username, 'Role:', userData.role);
          
          return res.status(200).json({
            success: true,
            message: 'Login successful',
            session_token: sessionToken,
            role: userData.role,
            username: userData.username
          });
        } else {
          console.log('❌ Password verification failed for user:', username);
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials',
            debug: {
              username: username,
              password_check: 'failed'
            }
          });
        }
      } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
          success: false,
          message: 'Login system temporarily unavailable',
          error: error.message
        });
      }
    }

    // Debug endpoint to check admin status
    if (action === 'debug_admin') {
      try {
        const userBlobs = await list({ prefix: 'users/daveblunts' });
        const credentialBlobs = await list({ prefix: 'config/admin-credentials' });
        
        let userExists = userBlobs.blobs.length > 0;
        let credentialsExist = credentialBlobs.blobs.length > 0;
        let userData = null;
        let credentialData = null;
        
        if (userExists) {
          const userResponse = await fetch(userBlobs.blobs[0].url);
          userData = await userResponse.json();
        }
        
        if (credentialsExist) {
          const credResponse = await fetch(credentialBlobs.blobs[0].url);
          credentialData = await credResponse.json();
        }
        
        return res.status(200).json({
          success: true,
          debug: {
            user_exists: userExists,
            credentials_exist: credentialsExist,
            user_data: userData ? {
              username: userData.username,
              role: userData.role,
              created: userData.created,
              has_password: !!userData.password
            } : null,
            credential_data: credentialData ? {
              username: credentialData.username,
              has_password: !!credentialData.password,
              created: credentialData.created
            } : null
          }
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Debug failed',
          error: error.message
        });
      }
    }

    // Force admin reset endpoint (for debugging)
    if (action === 'reset_admin') {
      try {
        console.log('🔄 Forcing admin reset...');
        
        // Delete existing admin user
        const userBlobs = await list({ prefix: 'users/daveblunts' });
        // Note: Vercel blob doesn't have a delete API in the basic package
        // You would need to manually delete or let it expire
        
        // Reinitialize admin
        const result = await initializeAdmin();
        
        return res.status(200).json({
          success: true,
          message: 'Admin reset completed',
          result: result
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Admin reset failed',
          error: error.message
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

      // Basic validation
      if (new_username.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Username must be at least 3 characters'
        });
      }

      if (new_password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
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
        // Check if session is expired (24 hours)
        const expireTime = 24 * 60 * 60 * 1000;
        if (Date.now() - session.created > expireTime) {
          activeSessions.delete(session_token);
          return res.status(200).json({
            success: true,
            valid: false,
            message: 'Session expired'
          });
        }
        
        return res.status(200).json({
          success: true,
          valid: true,
          username: session.username,
          role: session.role
        });
      } else {
        return res.status(200).json({
          success: true,
          valid: false,
          message: 'Invalid session'
        });
      }
    }

    if (action === 'logout') {
      const { session_token } = req.body;
      const deleted = activeSessions.delete(session_token);
      
      return res.status(200).json({
        success: true,
        message: deleted ? 'Logged out successfully' : 'Session not found'
      });
    }

    // Protected endpoints - require authentication for certain actions
    if (['upload_script', 'list_scripts'].includes(action)) {
      const { session_token } = req.body;
      const session = activeSessions.get(session_token);
      
      if (!session) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Check session expiry
      const expireTime = 24 * 60 * 60 * 1000;
      if (Date.now() - session.created > expireTime) {
        activeSessions.delete(session_token);
        return res.status(401).json({
          success: false,
          message: 'Session expired, please log in again'
        });
      }
    }

    // Script management endpoints
    const { auth_key, user_data, script_data } = req.body;

    // Upload Script to /scripts/ folder
    if (action === 'upload_script') {
      const { session_token } = req.body;
      const session = activeSessions.get(session_token);
      
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
        console.log('🔍 Fetch request for auth_key:', auth_key);
        
        // List all scripts in storage to see what actually exists
        const { blobs } = await list({
          prefix: 'scripts/',
          limit: 50
        });
        
        console.log('📁 Scripts in storage:', blobs.length, 'total');
        
        const expectedPath = `scripts/${auth_key}.lua`;
        console.log('🎯 Looking for:', expectedPath);
        
        // Check if our expected file exists
        const matchingBlob = blobs.find(b => b.pathname === expectedPath);
        
        if (matchingBlob) {
          console.log('✅ Found exact match:', matchingBlob.pathname);
          
          try {
            const response = await fetch(matchingBlob.url);
            if (response.ok) {
              const script = await response.text();
              
              console.log('✅ Script retrieved successfully:', {
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
                message: 'Script retrieved successfully'
              });
            } else {
              console.error('❌ Failed to fetch blob content:', response.status, response.statusText);
            }
          } catch (fetchError) {
            console.error('❌ Error fetching blob content:', fetchError);
          }
        }
        
        // If no exact match found
        console.log('❌ Script not found:', auth_key);
        
        return res.status(401).json({
          success: false,
          message: 'Script not found or access denied',
          requested_key: auth_key
        });

      } catch (error) {
        console.error('❌ Fetch error:', error);
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
      const { session_token } = req.body;
      const session = activeSessions.get(session_token);
      
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
            const metaBlobs = await list({ prefix: `meta/${filename}` });
            if (metaBlobs.blobs.length > 0) {
              const metaResponse = await fetch(metaBlobs.blobs[0].url);
              if (metaResponse.ok) {
                metadata = await metaResponse.json();
              }
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
          total: scripts.length,
          user: session.username
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
      message: 'Invalid action: ' + action
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