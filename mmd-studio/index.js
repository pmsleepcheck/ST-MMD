// index.js - MMD Studio SillyTavern Extension
(function () {

// ==========================================
// 1. 提示词配置
// ==========================================
const POPO_SYSTEM_PROMPT = `You are an expert MMD Pose Language (MPL) animation generator. Generate complete MPL code with poses and animations based on natural language descriptions.

## MPL SYNTAX RULES

### Bone Statement Format:
- Single action: bone action direction amount;
- Compound actions: bone action1 direction1 amount1, action2 direction2 amount2;
- Reset: bone reset;

### Actions and Their ONLY Valid Directions:
| Action | Valid Directions |
|--------|------------------|
| bend | forward, backward |
| turn | left, right |
| sway | left, right |
| move | forward, backward, left, right, up, down |

## BONE LIMITS REFERENCE

### Body Bones:
| Bone | bend fwd | bend bwd | turn l/r | sway l/r | move |
|------|----------|----------|----------|----------|------|
| base | 90 | 90 | 180 | 180 | 100 |
| center | 180 | 180 | 180 | 180 | 100 |
| upper_body | 90 | 90 | 90 | 90 | - |
| lower_body | 90 | 90 | 90 | 90 | - |
| waist | 90 | 90 | 90 | 90 | - |
| neck | 60 | 90 | 90 | 60 | - |
| head | 60 | 90 | 90 | 60 | - |

### Arm Bones:
| Bone | bend fwd | bend bwd | turn l/r | sway l/r |
|------|----------|----------|----------|----------|
| shoulder_l/r | 90 | 90 | 90 | 90 |
| arm_l/r | 90 | 90 | 90 | 90 |
| elbow_l/r | 180 | - | - | - |
| wrist_l/r | 60 | 90 | 90 | 90 |

### Leg Bones:
| Bone | bend fwd | bend bwd | turn l/r | sway l | sway r |
|------|----------|----------|----------|--------|--------|
| leg_l | 180 | 90 | 90 | 180 | 30 |
| leg_r | 180 | 90 | 90 | 30 | 180 |
| knee_l/r | - | 180 | - | - | - |
| ankle_l/r | 60 | 60 | 90 | 30 | 30 |

### Finger Bones (NO turn):
| Bone | bend fwd | bend bwd | sway l/r |
|------|----------|----------|----------|
| thumb_l/r | 90 | 30 | 45 |
| index/middle/ring/pinky_l/r | 90 | 30 | 30 |

### Key Constraints:
- Elbows ONLY bend forward; Knees ONLY bend backward
- Default pose is A-pose
- Round degrees to nearest 5

## MPL STRUCTURE

\`\`\`
@pose pose_name {
    bone action direction amount;
}

@animation animation_name {
    0: pose_name_1;
    1.5: pose_name_2;
}

main {
    animation_name;
}
\`\`\`

## OUTPUT FORMAT
Always wrap output in \`\`\`mpl code block. Generate COMPLETE MPL code with @pose, @animation, and main blocks.

## EXAMPLES

Input: wave hand
Output:
\`\`\`mpl
@pose wave_start {
    shoulder_r bend backward 30, sway left 20;
    arm_r bend backward 60;
    elbow_r bend forward 90;
    wrist_r sway left 20;
}

@pose wave_left {
    shoulder_r bend backward 30, sway left 20;
    arm_r bend backward 60;
    elbow_r bend forward 90;
    wrist_r sway left 30;
}

@pose wave_right {
    shoulder_r bend backward 30, sway left 20;
    arm_r bend backward 60;
    elbow_r bend forward 90;
    wrist_r sway right 10;
}

@animation wave {
    0: wave_start;
    0.3: wave_left;
    0.6: wave_right;
    0.9: wave_left;
    1.2: wave_right;
    1.5: wave_start;
}

main {
    wave;
}
\`\`\`
`;

// ==========================================
// 2. 扩展状态
// ==========================================
const extensionName = 'mmd-studio';
let mmdPlayer = null;
let lastCapturedMPL = '';

// 获取插件基础路径
function getBasePath() {
    const scripts = document.querySelectorAll('script[src]');
    for (const script of scripts) {
        if (script.src.includes('mmd-studio')) {
            return script.src.replace(/\/[^/]*$/, '');
        }
    }
    return '/scripts/extensions/third-party/mmd-studio';
}

const BASE_PATH = getBasePath();

// ==========================================
// 3. 加载库
// ==========================================
async function loadMMDLibs() {
    // 动态导入 ES 模块
    const module = await import(`${BASE_PATH}/mmd-studio-lib.js`);
    
    // 初始化 WASM
    if (module.initWasm) {
        await module.initWasm();
    }
    
    return {
        Engine: module.Engine,
        WasmMPLCompiler: module.WasmMPLCompiler
    };
}

// ==========================================
// 4. MMD 播放器类
// ==========================================
class MMDPlayer {
    constructor(canvas) {
        this.canvas = canvas;
        this.engine = null;
        this.compiler = null;
        this.initialized = false;
        this.modelLoaded = false;
    }

    async init() {
        try {
            setStatus('⏳ 加载引擎库...', '#f6ad55');
            const { Engine, WasmMPLCompiler } = await loadMMDLibs();
            
            setStatus('⏳ 初始化渲染引擎...', '#f6ad55');
            // 初始化 reze-engine
            this.engine = new Engine(this.canvas, {});
            await this.engine.init();
            
            // 初始化 MPL 编译器
            this.compiler = new WasmMPLCompiler();
            
            // 启动渲染循环
            this.engine.runRenderLoop(() => {});
            
            this.initialized = true;
            console.log('[MMD Studio] ✅ 引擎初始化完成');
            
        } catch (e) {
            console.error('[MMD Studio] 引擎初始化失败:', e);
            throw e;
        }
    }

    async loadModel(url) {
        if (!this.initialized) {
            throw new Error('引擎未初始化');
        }
        
        try {
            setStatus(`⏳ 加载模型...`, '#f6ad55');
            await this.engine.loadModel(url);
            this.modelLoaded = true;
            console.log('[MMD Studio] ✅ 模型加载完成:', url);
        } catch (e) {
            console.error('[MMD Studio] 模型加载失败:', e);
            throw e;
        }
    }

    async playMPL(mplCode) {
        if (!this.initialized) {
            throw new Error('引擎未初始化');
        }
        if (!this.modelLoaded) {
            throw new Error('请先加载模型');
        }

        try {
            setStatus('⏳ 编译 MPL...', '#f6ad55');
            
            // 使用 WasmMPLCompiler 编译 MPL 代码为 VMD
            const vmdData = this.compiler.compile(mplCode);
            
            // 将 VMD 数据转为 Blob URL
            const blob = new Blob([vmdData], { type: 'application/octet-stream' });
            const vmdUrl = URL.createObjectURL(blob);
            
            setStatus('⏳ 加载动画...', '#f6ad55');
            
            // 加载并播放动画
            await this.engine.loadAnimation(vmdUrl);
            await new Promise(resolve => requestAnimationFrame(resolve));
            this.engine.playAnimation();
            
            // 清理 Blob URL
            URL.revokeObjectURL(vmdUrl);
            
            return true;
        } catch (e) {
            console.error('[MMD Studio] MPL 编译/播放失败:', e);
            throw e;
        }
    }

    reset() {
        // 停止当前动画，重置到初始姿势
        if (this.engine) {
            // 根据 reze-engine API 可能需要调整
            try {
                this.engine.stopAnimation?.();
            } catch (e) {
                console.warn('[MMD Studio] 重置警告:', e);
            }
        }
    }

    resize() {
        if (this.engine && this.engine.resize) {
            this.engine.resize();
        }
    }

    dispose() {
        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
        }
        this.compiler = null;
        this.initialized = false;
        this.modelLoaded = false;
    }
}

// ==========================================
// 5. 注入 CSS
// ==========================================
function injectStyles() {
    if (document.getElementById('mmd-studio-css')) return;
    const style = document.createElement('style');
    style.id = 'mmd-studio-css';
    style.textContent = `
    #mmd-toggle-btn {
        position: fixed; top: 6px; right: 60px; z-index: 99999;
        background: linear-gradient(135deg,#4a5568,#2d3748);
        color: #e2e8f0; padding: 6px 14px; border-radius: 6px;
        cursor: pointer; font-size: 13px; font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,.3);
        user-select: none; transition: background .2s;
    }
    #mmd-toggle-btn:hover { background: linear-gradient(135deg,#5a6578,#3d4758); }
    #mmd-toggle-btn.has-mpl {
        background: linear-gradient(135deg,#38a169,#276749);
        animation: mmd-pulse .6s ease 2;
    }
    @keyframes mmd-pulse {
        0%,100%{ transform:scale(1); }
        50%{ transform:scale(1.12); }
    }

    #mmd-studio-root {
        position: fixed; top: 0; right: -450px; width: 430px; height: 100vh;
        background: #16192b; color: #e0e0e0; z-index: 99998;
        transition: right .35s cubic-bezier(.4,0,.2,1);
        display: flex; flex-direction: column;
        box-shadow: -3px 0 16px rgba(0,0,0,.6);
        font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    }
    #mmd-studio-root.open { right: 0; }

    .mmd-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 16px; background: #1e2140; border-bottom: 1px solid #2a2d50;
    }
    .mmd-header h3 { margin: 0; font-size: 15px; color: #a0aec0; }
    .mmd-close-btn {
        cursor: pointer; font-size: 18px; color: #718096;
        padding: 2px 6px; border-radius: 4px;
    }
    .mmd-close-btn:hover { background: #2d3748; color: #e2e8f0; }

    .mmd-content {
        flex: 1; overflow-y: auto; display: flex; flex-direction: column;
    }
    .mmd-canvas-wrap {
        width: 100%; height: 320px; min-height: 200px;
        background: #0d0f1a; position: relative;
    }
    #mmd-canvas { width: 100% !important; height: 100% !important; display: block; outline: none; }

    .mmd-controls { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }

    .mmd-input-group { display: flex; flex-direction: column; gap: 4px; }
    .mmd-input-group label {
        font-size: 12px; font-weight: 600; color: #a0aec0; text-transform: uppercase;
        letter-spacing: .5px;
    }
    .mmd-textarea {
        width: 100%; min-height: 100px; max-height: 250px;
        background: #1a1d35; color: #c3dafe; border: 1px solid #2d3058;
        border-radius: 6px; padding: 10px; font-size: 12px;
        font-family: "Fira Code","Cascadia Code",Consolas,monospace;
        resize: vertical; line-height: 1.5; box-sizing: border-box;
    }
    .mmd-textarea:focus { border-color: #5a67d8; outline: none; }

    .mmd-status {
        font-size: 12px; padding: 6px 10px;
        background: #1a1d35; border-radius: 4px; color: #718096;
        min-height: 20px;
    }

    .mmd-btn-row {
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    }
    .mmd-btn-primary {
        flex: 1; padding: 8px 16px; border: none; border-radius: 6px;
        background: linear-gradient(135deg,#5a67d8,#4c51bf);
        color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
        transition: opacity .2s;
    }
    .mmd-btn-primary:hover { opacity: .85; }
    .mmd-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
    .mmd-btn-secondary {
        padding: 6px 12px; border: 1px solid #4a5568; border-radius: 5px;
        background: transparent; color: #a0aec0; font-size: 12px; cursor: pointer;
    }
    .mmd-btn-secondary:hover { background: #2d3748; }

    .mmd-checkbox-label {
        display: flex; align-items: center; gap: 5px;
        font-size: 12px; color: #a0aec0; cursor: pointer; white-space: nowrap;
    }
    
    .mmd-settings-panel { margin-top: 4px; }
    .mmd-settings-panel summary {
        font-size: 12px; color: #718096; cursor: pointer; user-select: none;
    }
    .mmd-settings-panel[open] summary { margin-bottom: 8px; }
    
    .mmd-model-input {
        width: 100%; padding: 6px 10px; background: #1a1d35;
        color: #c3dafe; border: 1px solid #2d3058; border-radius: 4px;
        font-size: 12px; box-sizing: border-box;
    }
    .mmd-model-input:focus { border-color: #5a67d8; outline: none; }
    
    .mmd-file-input-wrap {
        display: flex; gap: 8px; align-items: center;
    }
    .mmd-file-input-wrap input[type="file"] {
        flex: 1; font-size: 11px; color: #a0aec0;
    }
    
    .mmd-webgpu-warning {
        background: #744210; color: #faf089; padding: 8px 12px;
        border-radius: 6px; font-size: 12px; margin-bottom: 8px;
    }
    `;
    document.head.appendChild(style);
}

// ==========================================
// 6. 检查 WebGPU 支持
// ==========================================
async function checkWebGPU() {
    if (!navigator.gpu) {
        return { supported: false, reason: '浏览器不支持 WebGPU' };
    }
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return { supported: false, reason: '无法获取 GPU 适配器' };
        }
        return { supported: true };
    } catch (e) {
        return { supported: false, reason: e.message };
    }
}

// ==========================================
// 7. 初始化 UI
// ==========================================
async function initUI() {
    injectStyles();

    // 顶部按钮
    const toggleBtn = document.createElement('div');
    toggleBtn.id = 'mmd-toggle-btn';
    toggleBtn.textContent = 'MMD';
    toggleBtn.title = '打开 MMD Studio 面板';
    document.body.appendChild(toggleBtn);

    // 主面板
    const panel = document.createElement('div');
    panel.id = 'mmd-studio-root';
    panel.innerHTML = `
        <div class="mmd-header">
            <h3>🎭 MMD Studio</h3>
            <span class="mmd-close-btn">✕</span>
        </div>
        <div class="mmd-content">
            <div id="mmd-webgpu-check"></div>
            <div class="mmd-canvas-wrap">
                <canvas id="mmd-canvas"></canvas>
            </div>
            <div class="mmd-controls">
                <!-- 模型设置 -->
                <details class="mmd-settings-panel" open>
                    <summary>📦 模型设置</summary>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <input type="text" id="mmd-model-url" class="mmd-model-input" 
                            placeholder="模型 URL (如 /models/xxx.pmx)" 
                            value="/scripts/extensions/third-party/mmd-studio/aa/base.pmx">
                        <div class="mmd-btn-row">
                            <button id="mmd-load-model-btn" class="mmd-btn-secondary">📦 加载模型</button>
                            <span id="mmd-model-status" style="font-size:11px;color:#718096;">未加载</span>
                        </div>
                    </div>
                </details>
                
                <!-- MPL 代码 -->
                <div class="mmd-input-group">
                    <label>MPL 代码</label>
                    <textarea id="mmd-prompt" class="mmd-textarea"
                        placeholder="等待 AI 回复中的 MPL 代码…&#10;也可手动粘贴 MPL 代码到此处"></textarea>
                </div>
                
                <div id="mmd-status" class="mmd-status">⏳ 等待初始化...</div>
                
                <div class="mmd-btn-row">
                    <button id="mmd-gen-btn" class="mmd-btn-primary" disabled>▶ 生成动画</button>
                    <button id="mmd-reset-btn" class="mmd-btn-secondary">↺ 重置</button>
                    <label class="mmd-checkbox-label">
                        <input type="checkbox" id="mmd-auto-play" checked> 自动播放
                    </label>
                </div>
                
                <!-- 其他设置 -->
                <details class="mmd-settings-panel">
                    <summary>⚙️ 提示词 & 帮助</summary>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                        <button id="mmd-copy-prompt" class="mmd-btn-secondary">
                            📋 复制 MPL System Prompt
                        </button>
                        <p style="font-size:11px;color:#718096;margin:0">
                            将提示词粘贴到角色卡 System Prompt 或 World Info 中，
                            AI 会用 \`\`\`mpl 代码块回复动作。
                        </p>
                    </div>
                </details>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // ---- 检查 WebGPU ----
    const webgpuCheck = document.getElementById('mmd-webgpu-check');
    const gpuStatus = await checkWebGPU();
    if (!gpuStatus.supported) {
        webgpuCheck.innerHTML = `
            <div class="mmd-webgpu-warning">
                ⚠️ WebGPU 不可用: ${gpuStatus.reason}<br>
                <small>请使用 Chrome 113+ 或 Edge 113+ 并启用 WebGPU</small>
            </div>
        `;
    }

    // ---- 事件绑定 ----
    toggleBtn.addEventListener('click', async () => {
        const isOpen = panel.classList.toggle('open');
        toggleBtn.classList.remove('has-mpl');
        if (isOpen && !mmdPlayer) {
            await initPlayer();
        } else if (isOpen && mmdPlayer) {
            mmdPlayer.resize();
        }
    });

    panel.querySelector('.mmd-close-btn').addEventListener('click', () => {
        panel.classList.remove('open');
    });

    document.getElementById('mmd-gen-btn').addEventListener('click', generateMotion);

    document.getElementById('mmd-reset-btn').addEventListener('click', () => {
        if (mmdPlayer) mmdPlayer.reset();
        setStatus('↺ 已重置', '#a0aec0');
    });

    document.getElementById('mmd-load-model-btn').addEventListener('click', loadModel);

    document.getElementById('mmd-copy-prompt').addEventListener('click', () => {
        navigator.clipboard.writeText(POPO_SYSTEM_PROMPT).then(() => {
            setStatus('📋 提示词已复制', '#48bb78');
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = POPO_SYSTEM_PROMPT;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setStatus('📋 提示词已复制', '#48bb78');
        });
    });
}

// ==========================================
// 8. 播放器初始化
// ==========================================
async function initPlayer() {
    const canvas = document.getElementById('mmd-canvas');
    if (!canvas) return;

    setStatus('⏳ 初始化引擎...', '#f6ad55');
    
    try {
        mmdPlayer = new MMDPlayer(canvas);
        await mmdPlayer.init();
        
        setStatus('✅ 引擎就绪，请加载模型', '#48bb78');
    } catch (e) {
        setStatus('❌ 引擎初始化失败: ' + e.message, '#fc8181');
        console.error('[MMD Studio]', e);
    }
}

// ==========================================
// 9. 加载模型
// ==========================================
async function loadModel() {
    const urlInput = document.getElementById('mmd-model-url');
    const statusEl = document.getElementById('mmd-model-status');
    const url = urlInput?.value?.trim();
    
    if (!url) {
        statusEl.textContent = '请输入模型路径';
        statusEl.style.color = '#fc8181';
        return;
    }
    
    if (!mmdPlayer || !mmdPlayer.initialized) {
        setStatus('⚠️ 请先等待引擎初始化', '#ed8936');
        return;
    }
    
    statusEl.textContent = '加载中...';
    statusEl.style.color = '#f6ad55';
    
    try {
        await mmdPlayer.loadModel(url);
        statusEl.textContent = '✅ 已加载';
        statusEl.style.color = '#48bb78';
        
        document.getElementById('mmd-gen-btn').disabled = false;
        setStatus('✅ 模型已加载，可以生成动画', '#48bb78');
    } catch (e) {
        statusEl.textContent = '❌ 加载失败';
        statusEl.style.color = '#fc8181';
        setStatus('❌ 模型加载失败: ' + e.message, '#fc8181');
    }
}

// ==========================================
// 10. 生成动画
// ==========================================
async function generateMotion() {
    const textarea = document.getElementById('mmd-prompt');
    const btn = document.getElementById('mmd-gen-btn');

    if (!textarea || !textarea.value.trim()) {
        setStatus('⚠️ 无 MPL 代码', '#ed8936');
        return;
    }

    if (!mmdPlayer || !mmdPlayer.initialized) {
        setStatus('⚠️ 引擎未就绪', '#ed8936');
        return;
    }
    
    if (!mmdPlayer.modelLoaded) {
        setStatus('⚠️ 请先加载模型', '#ed8936');
        return;
    }

    btn.textContent = '编译中...';
    btn.disabled = true;

    try {
        await mmdPlayer.playMPL(textarea.value);
        setStatus('▶️ 播放中', '#48bb78');
    } catch (e) {
        console.error('[MMD Studio]', e);
        setStatus('❌ ' + e.message, '#fc8181');
    } finally {
        btn.textContent = '▶ 生成动画';
        btn.disabled = false;
    }
}

// ==========================================
// 11. 监听酒馆 AI 回复
// ==========================================
function startMessageObserver() {
    const tryAttach = () => {
        const chat = document.getElementById('chat');
        if (!chat) {
            setTimeout(tryAttach, 2000);
            return;
        }
        let timer = null;
        const obs = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(scanForMPL, 1200);
        });
        obs.observe(chat, { childList: true, subtree: true, characterData: true });
        console.log('[MMD Studio] ✅ 已挂载消息监听器');
    };
    tryAttach();
}

function scanForMPL() {
    const messages = document.querySelectorAll('#chat .mes');
    if (!messages.length) return;

    const start = Math.max(0, messages.length - 5);
    for (let i = messages.length - 1; i >= start; i--) {
        const msg = messages[i];
        if (msg.getAttribute('is_user') === 'true') continue;

        const mesText = msg.querySelector('.mes_text');
        if (!mesText) continue;

        let mplCode = null;

        // 策略 1: language-mpl 代码块
        const langBlock = mesText.querySelector('code.language-mpl, code.hljs.language-mpl');
        if (langBlock) {
            mplCode = langBlock.textContent.trim();
        }

        // 策略 2: 任意代码块含 @pose + @animation
        if (!mplCode) {
            const codeBlocks = mesText.querySelectorAll('pre code');
            for (const cb of codeBlocks) {
                const t = cb.textContent.trim();
                if (t.includes('@pose') && t.includes('@animation')) {
                    mplCode = t;
                    break;
                }
            }
        }

        // 策略 3: 正则匹配
        if (!mplCode) {
            const raw = mesText.innerText || mesText.textContent || '';
            const m = raw.match(/```mpl\s*([\s\S]*?)```/);
            if (m) mplCode = m[1].trim();
        }

        if (mplCode && mplCode !== lastCapturedMPL) {
            lastCapturedMPL = mplCode;
            handleMPLDetected(mplCode);
            return;
        }
    }
}

function handleMPLDetected(code) {
    console.log('[MMD Studio] 🎯 捕获 MPL:', code.substring(0, 80) + '...');

    const textarea = document.getElementById('mmd-prompt');
    if (textarea) textarea.value = code;

    setStatus('✅ 已捕获 MPL 代码', '#48bb78');

    const btn = document.getElementById('mmd-toggle-btn');
    if (btn) {
        btn.classList.remove('has-mpl');
        void btn.offsetWidth;
        btn.classList.add('has-mpl');
    }

    const panel = document.getElementById('mmd-studio-root');
    if (panel && !panel.classList.contains('open')) {
        panel.classList.add('open');
    }

    const autoPlay = document.getElementById('mmd-auto-play');
    const shouldAutoPlay = autoPlay ? autoPlay.checked : true;

    if (!mmdPlayer) {
        initPlayer().then(() => {
            // 自动播放需要先加载模型
            if (shouldAutoPlay && mmdPlayer?.initialized && mmdPlayer?.modelLoaded) {
                setTimeout(generateMotion, 300);
            }
        });
    } else if (shouldAutoPlay && mmdPlayer.initialized && mmdPlayer.modelLoaded) {
        generateMotion();
    }
}

// ==========================================
// 12. 工具函数
// ==========================================
function setStatus(text, color) {
    const el = document.getElementById('mmd-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '#a0aec0';
}

// ==========================================
// 13. 入口
// ==========================================
setTimeout(() => {
    initUI().then(() => {
        startMessageObserver();
        console.log('[MMD Studio] 🚀 扩展已加载');
    });
}, 1500);

})();