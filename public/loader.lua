--[[
    GoatAuth Loader v2.0
    Set Goat_key = "your-key" before executing this script.
--]]

local GOATAUTH_HOST = "https://your-domain.com" -- change to your GoatAuth URL
local APP_NAME      = "goat"
local OWNER_ID      = "jzFZ2kDRFW"

-- ─── Already authenticated guard ─────────────────────────────────────────────
if _G.GoatAuth_Session then return end

local HttpService  = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local Players      = game:GetService("Players")
local Player       = Players.LocalPlayer
local PlayerGui    = Player:WaitForChild("PlayerGui")

-- ─── HTTP helpers ─────────────────────────────────────────────────────────────
local function request(opts)
    local candidates = {}
    pcall(function() if syn and syn.request   then candidates[#candidates+1] = syn.request   end end)
    pcall(function() if http_request           then candidates[#candidates+1] = http_request  end end)
    pcall(function() if request                then candidates[#candidates+1] = request       end end)
    pcall(function()
        if type(getgenv) == "function" then
            local g = getgenv()
            if type(g.http_request) == "function" then candidates[#candidates+1] = g.http_request end
            if type(g.request)      == "function" then candidates[#candidates+1] = g.request      end
        end
    end)
    pcall(function() if fluxus and fluxus.request then candidates[#candidates+1] = fluxus.request end end)

    for _, fn in ipairs(candidates) do
        local ok, res = pcall(fn, opts)
        if ok and type(res) == "table" then
            local body = res.Body or res.body or ""
            body = body:gsub("^%s+",""):gsub("%s+$","")
            if body ~= "" then return body end
        end
    end

    -- Fallback to game:HttpGet for GET requests
    if opts.Method == "GET" then
        local ok2, res2 = pcall(function() return game:HttpGet(opts.Url) end)
        if ok2 and type(res2) == "string" and res2 ~= "" then return res2 end
    end
    return nil
end

local function post(path, payload)
    local body = request({
        Url     = GOATAUTH_HOST .. path,
        Method  = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body    = HttpService:JSONEncode(payload),
    })
    if not body then return nil, "no response" end
    local ok, data = pcall(function() return HttpService:JSONDecode(body) end)
    if not ok then return nil, "bad JSON" end
    return data, nil
end

local function get(path)
    local body = request({ Url = GOATAUTH_HOST .. path, Method = "GET" })
    if not body then return nil, "no response" end
    local ok, data = pcall(function() return HttpService:JSONDecode(body) end)
    if not ok then return nil, "bad JSON" end
    return data, nil
end

-- ─── Notification UI ──────────────────────────────────────────────────────────
local function notify(text, duration)
    local gui = PlayerGui:FindFirstChild("GoatAuthNotify")
    if not gui then
        gui = Instance.new("ScreenGui")
        gui.Name           = "GoatAuthNotify"
        gui.IgnoreGuiInset = true
        gui.ResetOnSpawn   = false
        gui.Parent         = PlayerGui

        local holder = Instance.new("Frame", gui)
        holder.Name                  = "Holder"
        holder.BackgroundTransparency = 1
        holder.AnchorPoint           = Vector2.new(0, 0)
        holder.Position              = UDim2.new(0, 20, 0, 35)
        holder.Size                  = UDim2.new(0, 360, 1, -70)

        local layout = Instance.new("UIListLayout", holder)
        layout.SortOrder            = Enum.SortOrder.LayoutOrder
        layout.HorizontalAlignment  = Enum.HorizontalAlignment.Left
        layout.Padding              = UDim.new(0, 8)
    end

    local holder = gui:FindFirstChild("Holder")
    local frame  = Instance.new("Frame", holder)
    frame.BackgroundColor3   = Color3.fromRGB(20, 22, 30)
    frame.Size               = UDim2.new(1, 0, 0, 60)
    frame.BorderSizePixel    = 0
    frame.BackgroundTransparency = 1
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)

    local accent = Instance.new("Frame", frame)
    accent.Size             = UDim2.new(0, 3, 1, 0)
    accent.BackgroundColor3 = Color3.fromRGB(0, 232, 122)
    accent.BorderSizePixel  = 0
    Instance.new("UICorner", accent).CornerRadius = UDim.new(0, 3)

    local title = Instance.new("TextLabel", frame)
    title.BackgroundTransparency = 1
    title.Position    = UDim2.new(0, 14, 0, 6)
    title.Size        = UDim2.new(1, -18, 0, 22)
    title.Font        = Enum.Font.GothamBold
    title.Text        = "🐐 GoatAuth"
    title.TextSize    = 13
    title.TextColor3  = Color3.fromRGB(0, 232, 122)
    title.TextXAlignment = Enum.TextXAlignment.Left

    local body = Instance.new("TextLabel", frame)
    body.BackgroundTransparency = 1
    body.Position    = UDim2.new(0, 14, 0, 28)
    body.Size        = UDim2.new(1, -18, 0, 24)
    body.Font        = Enum.Font.Gotham
    body.Text        = tostring(text)
    body.TextSize    = 12
    body.TextColor3  = Color3.fromRGB(200, 210, 220)
    body.TextXAlignment = Enum.TextXAlignment.Left
    body.TextWrapped = true

    TweenService:Create(frame, TweenInfo.new(0.2, Enum.EasingStyle.Quad), { BackgroundTransparency = 0 }):Play()

    task.delay(duration or 5, function()
        TweenService:Create(frame, TweenInfo.new(0.2, Enum.EasingStyle.Quad), { BackgroundTransparency = 1 }):Play()
        task.wait(0.25)
        frame:Destroy()
    end)
end

-- ─── Executor detection ───────────────────────────────────────────────────────
local function detectExecutor()
    local name = "Unknown"
    pcall(function()
        if syn           then name = "Synapse X"
        elseif fluxus    then name = "Fluxus"
        elseif delta     then name = "Delta"
        elseif arceus    then name = "Arceus X"
        elseif krnl      then name = "KRNL"
        elseif electron  then name = "Electron"
        elseif identifyexecutor then name = identifyexecutor()
        end
    end)
    return name
end

-- ─── HWID ─────────────────────────────────────────────────────────────────────
local hwid = "unsupported"
pcall(function() if gethwid then hwid = gethwid() end end)

-- ─── Read key ─────────────────────────────────────────────────────────────────
local function readKey()
    local k
    pcall(function()
        if type(getgenv) == "function" then
            local g = getgenv()
            k = (type(g.Goat_key)  == "string" and #g.Goat_key  > 0 and g.Goat_key)
             or (type(g.GoatKey)   == "string" and #g.GoatKey   > 0 and g.GoatKey)
        end
    end)
    if not k and type(_G.Goat_key) == "string" and #_G.Goat_key > 0 then k = _G.Goat_key end
    if not k and type(Goat_key)    == "string" and #Goat_key    > 0 then k = Goat_key    end
    return k
end

-- ─── Game script map ──────────────────────────────────────────────────────────
local gameScripts = {
    [4777817887] = "BladeBall",
    [111958650]  = "Arsenal",
    [5326530956] = "ChaosRemastered",
    [3258873704] = "SkyWars",
}

-- ─── Main auth flow ───────────────────────────────────────────────────────────
local function authenticate(key)
    notify("Connecting to GoatAuth...", 3)

    -- Step 1: init
    local initData, initErr = post("/api/v1/init", {
        app_name = APP_NAME,
        owner_id = OWNER_ID,
    })
    if not initData or not initData.success then
        return notify("Auth failed: " .. tostring(initData and initData.message or initErr), 6)
    end

    notify("Verifying key...", 3)

    -- Step 2: authenticate
    local authData, authErr = post("/api/v1/auth", {
        token = initData.token,
        key   = key,
        hwid  = hwid,
    })
    if not authData or not authData.success then
        return notify(tostring(authData and authData.message or authErr), 6)
    end

    -- Authenticated
    _G.GoatAuth_Session      = authData.session_id
    _G.GoatAuth_Key          = key
    _G.GoatAuth_Subscription = authData.user.subscription
    _G.GoatAuth_ExpiresAt    = authData.user.expires_at

    -- Show expiry
    local info = authData.user
    local subLabel = (info.subscription or "free") .. (info.expires_at and
        (" · " .. os.date("!%d %b %Y", info.expires_at)) or " · Lifetime")
    notify("Authenticated · " .. subLabel, 10)

    -- Track execution (fire-and-forget)
    task.spawn(function()
        local gameName = "Unknown"
        pcall(function()
            gameName = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name
        end)
        post("/api/track", {
            key         = key,
            executor    = detectExecutor(),
            game        = gameName .. " (" .. tostring(game.PlaceId) .. ")",
            game_id     = game.PlaceId,
            job_id      = tostring(game.JobId ~= "" and game.JobId or os.time()),
            hwid        = hwid,
            roblox_user = Player.Name,
            roblox_id   = Player.UserId,
        })
    end)

    -- Load script
    local scriptName = gameScripts[game.PlaceId] or "Universal"
    local tier       = info.subscription or "free"
    local scriptUrl  = GOATAUTH_HOST .. "/api/scripts/" .. scriptName .. "?sub=" .. tier .. "&key=" .. HttpService:UrlEncode(key)

    task.spawn(function()
        local src = request({ Url = scriptUrl, Method = "GET" })
        if not src or #src < 20 then
            return notify("Failed to load script — check console", 6)
        end
        if src:find("<!DOCTYPE", 1, true) or src:find("<html", 1, true) then
            return notify("Script load error: got HTML response", 6)
        end
        local fn, compileErr = loadstring(src)
        if not fn then
            return notify("Compile error: " .. tostring(compileErr), 8)
        end
        local ok2, runErr = pcall(fn)
        if not ok2 then
            notify("Runtime error: " .. tostring(runErr), 8)
        end
    end)
end

-- ─── Wait for key then auth ───────────────────────────────────────────────────
local function run()
    -- Try immediately
    local key = readKey()
    if key then authenticate(key); return end

    -- Poll for up to 10 seconds
    for i = 1, 20 do
        task.wait(0.5)
        key = readKey()
        if key then authenticate(key); return end
    end

    notify("No key found. Set Goat_key before executing.", 8)
end

run()
