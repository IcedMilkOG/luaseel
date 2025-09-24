export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { auth_key, user_data, action } = req.body;

    if (!auth_key || action !== 'fetch_script') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request' 
      });
    }

    console.log('📊 User Data:', JSON.stringify(user_data, null, 2));
    console.log('🔑 Auth Key:', auth_key);

    const scripts = {
      'example123_abcd1234_fetch': `
print("Hello from Lua Seel!")
print("User: " .. game.Players.LocalPlayer.Name)
wait(2)
print("Script loaded successfully!")
      `.trim(),
      
      'test456_efgh5678_fetch': `
local player = game.Players.LocalPlayer
print("Welcome " .. player.Name .. "!")
print("Account age: " .. player.AccountAge .. " days")
      `.trim()
    };

    const script = scripts[auth_key];
    
    if (!script) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication key' 
      });
    }

    res.status(200).json({
      success: true,
      script: script,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
}