'use strict';
(() => {
  const results = {};
  const policyMessages = new Set();
  const runButton = document.getElementById('run');
  const copyButton = document.getElementById('copy');
  const report = document.getElementById('report');
  const summary = document.getElementById('summary');
  let running = false;
  let disposers = [];
  let runNumber = 0;
  const workerWaitMs=60000;
  document.addEventListener('securitypolicyviolation', event => {
    policyMessages.add('CSP: ' + event.effectiveDirective + ' (' + event.disposition + ')');
    updateReport();
  });
  function updateReport() {
    report.value = ['SimSim environment check v1.3', new Date().toISOString(),
      'Worker wait limit: 60 seconds; probes run one at a time',
      'Protocol: ' + location.protocol,
      'Secure context: ' + window.isSecureContext,
      'Browser: ' + navigator.userAgent,
      ...Object.keys(results).map(key => key + ': ' + results[key].state + '\n' + results[key].detail),
      ...policyMessages].join('\n\n');
  }
  function setResult(id, state, detail) {
    results[id] = {state, detail};
    const element = document.getElementById(id + '-status');
    element.textContent = {ok: '成功', fail: '失敗', pending: '確認中',timeout:'時間切れ（判定保留）'}[state];
    element.className = state;
    document.getElementById(id + '-detail').textContent = detail;
    updateReport();
  }
  function waitForWorker(id,started,finish){
    const timer=setInterval(()=>{
      const elapsed=performance.now()-started;
      if(elapsed>=workerWaitMs)finish('timeout','60秒以内に応答を確認できませんでした。起動遅延・配信・認証・環境制限のいずれかは、この結果だけでは判定できません。非対応と確定した結果ではありません。');
      else if(elapsed>=10000)setResult(id,'pending','起動・応答を待っています（'+Math.round(elapsed/1000)+'秒）。最大60秒待ちます。');
    },1000);
    return ()=>clearInterval(timer);
  }
  function workerTest(id, options) {
    setResult(id, 'pending', 'Workerの起動・計算・配列転送を確認しています…');
    return new Promise(resolve => {
      let worker;
      let stopWaiting=()=>{};
      let finished = false;
      const started = performance.now();
      const finish = (state, detail) => {
        if (finished) return;
        finished = true;
        stopWaiting();
        if (worker) worker.terminate();
        setResult(id, state, detail);
        resolve();
      };
      try {
        if (typeof Worker !== 'function') throw new Error('Worker APIがありません。');
        worker = new Worker(new URL('worker.js?v=20261006-terrain-grid-17', document.baseURI), options);
        worker.onerror = event => {
          event.preventDefault();
          finish('fail', (event.message || 'Workerを起動できませんでした。') + '\n'+(event.filename||'worker.js')+':'+(event.lineno||0)+'\nworker.jsの配信、JavaScriptのMIMEタイプ、CSPのworker-srcを確認してください。');
        };
        worker.onmessageerror = () => finish('fail', 'Workerの返信を読み取れませんでした。');
        worker.onmessage = event => {
          try {
            const values = new Float64Array(event.data.buffer);
            if (event.data.checksum !== 30 || values.length !== 4 || values.some((value, index) => value !== (index + 1) ** 2)) {
              throw new Error('計算結果が想定と異なります。');
            }
            finish('ok', 'Worker内の計算結果: 1² + 2² + 3² + 4² = 30\n配列の往復転送も成功。起動から応答まで ' + Math.round(performance.now() - started) + ' ms（性能評価ではありません）。');
          } catch (error) { finish('fail', error.message); }
        };
        stopWaiting=waitForWorker(id,started,finish);
        const values = new Float64Array([1, 2, 3, 4]);
        worker.postMessage({buffer: values.buffer}, [values.buffer]);
        if (values.buffer.byteLength !== 0) throw new Error('送信時の配列転送が確認できませんでした。');
      } catch (error) { finish('fail', error.name + ': ' + error.message); }
    });
  }
  function glTest(id, contextName) {
    const holder = document.getElementById(id + '-preview');
    holder.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 220;
    canvas.setAttribute('aria-label', contextName + 'で描画した青い三角形');
    holder.appendChild(canvas);
    const shaders = [];
    let gl, program, buffer, animation = 0;
    try {
      let creationError = '';
      canvas.addEventListener('webglcontextcreationerror', event => {creationError = event.statusMessage || '';});
      gl = canvas.getContext(contextName, {antialias:false, preserveDrawingBuffer:true});
      if (!gl) throw new Error('描画コンテキストを作成できません。' + (creationError ? '\n' + creationError : ''));
      const is2 = contextName === 'webgl2';
      const vertexSource = (is2 ? '#version 300 es\nin vec2 position;\n' : 'attribute vec2 position;\n') +
        'uniform float angle; void main(){float c=cos(angle),s=sin(angle); gl_Position=vec4(c*position.x-s*position.y,s*position.x+c*position.y,0.0,1.0);}';
      const fragmentSource = is2 ? '#version 300 es\nprecision mediump float; out vec4 color; void main(){color=vec4(0.12,0.68,0.93,1.0);}' :
        'precision mediump float; void main(){gl_FragColor=vec4(0.12,0.68,0.93,1.0);}';
      const compile = (type, source) => {
        const shader = gl.createShader(type); shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('シェーダ失敗: ' + gl.getShaderInfoLog(shader));
        return shader;
      };
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('プログラム失敗: ' + gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,.65,-.6,-.5,.6,-.5]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const angle = gl.getUniformLocation(program, 'angle');
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(.06,.10,.16,1);
      const draw = rotation => {gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(angle, rotation);gl.drawArrays(gl.TRIANGLES,0,3);};
      draw(0);
      const pixel = new Uint8Array(4);
      gl.readPixels(200,110,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const expected = [31,173,237,255];
      if (gl.getError() !== gl.NO_ERROR || pixel.some((value,index) => Math.abs(value - expected[index]) > 4)) {
        throw new Error('描画した中央画素を確認できません。値: ' + Array.from(pixel).join(','));
      }
      setResult(id, 'ok', 'シェーダ・三角形描画・画素検証が成功。\n' + gl.getParameter(gl.VERSION) + '\n最大テクスチャサイズ: ' + gl.getParameter(gl.MAX_TEXTURE_SIZE) + '\n青い三角形が回転します。GPUのハードウェア加速の有無は判定していません。');
      const currentRun = runNumber;
      const animate = time => {
        if (currentRun !== runNumber || gl.isContextLost()) return;
        draw(time * .0003); animation = requestAnimationFrame(animate);
      };
      animation = requestAnimationFrame(animate);
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();cancelAnimationFrame(animation);
        if (currentRun === runNumber) {
          setResult(id, 'fail', '描画開始後にWebGLコンテキストが失われました。');
          summary.textContent = '描画開始後に問題が発生しました。結果の詳細を確認してください。';
        }
      });
    } catch (error) { setResult(id, 'fail', error.message + '\nブラウザのWebGL制限、GPU／ドライバ、Consoleのエラーを確認してください。'); }
    disposers.push(() => {
      cancelAnimationFrame(animation);
      if (gl && !gl.isContextLost()) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        shaders.forEach(shader => gl.deleteShader(shader));
        const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      }
    });
  }
  function applicationWorkerTest(){
    setResult('application','pending','src/worker.jsと依存モジュールを読み込んでいます…');
    return new Promise(resolve=>{
      let worker,stopWaiting=()=>{},finished=false;
      const started=performance.now();
      const finish=(state,detail)=>{
        if(finished)return;
        finished=true;stopWaiting();worker?.terminate();
        setResult('application',state,detail);resolve();
      };
      try{
        worker=new Worker(new URL('../src/worker.js?v=20261006-terrain-grid-17',document.baseURI),{type:'module',name:'SimSim application probe'});
        worker.onerror=event=>{event.preventDefault();finish('fail',(event.message||'本体Workerの読み込みに失敗しました。')+'\n'+(event.filename||'src/worker.js')+':'+(event.lineno||0));};
        worker.onmessageerror=()=>finish('fail','本体Workerの返信を読み取れませんでした。');
        worker.onmessage=({data})=>{if(data.type==='pong')finish('ok','本体の計算Workerと依存モジュールを読み込み、応答を確認しました（'+Math.round(performance.now()-started)+' ms）。画面の初期化やシナリオ計算の成否は別です。');};
        stopWaiting=waitForWorker('application',started,finish);
        worker.postMessage({type:'ping'});
      }catch(error){finish('fail',error.name+': '+error.message);}
    });
  }
  async function jsonTest() {
    setResult('json','pending','probe.txtを読み込んでいます…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL('probe.txt', document.baseURI), {signal:controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.simsimEnvironmentProbe !== 1) throw new Error('JSONの内容が想定と異なります。');
      setResult('json','ok','同じフォルダの静的JSONを読み込めました。');
    } catch (error) { setResult('json','fail',error.name + ': ' + error.message + '\nprobe.txtの配置、配信、CSPのconnect-srcを確認してください。'); }
    finally {clearTimeout(timer);}
  }
  async function run() {
    if (running) return;
    running = true; runNumber++;
    disposers.forEach(dispose => dispose()); disposers = [];
    policyMessages.clear();
    runButton.disabled = true; copyButton.disabled = true;
    document.getElementById('copy-status').textContent = '';
    for(const id of ['classic','module','application','json','gl2','gl1'])setResult(id,'pending','確認の順番を待っています。');
    summary.textContent = location.protocol === 'file:' ? 'ファイルとして開いています。社内ポータルのHTTP／HTTPS URLでも必ず確認してください。' : 'Workerを一つずつ確認しています。各Workerは最大60秒待ちます。';
    // Avoid competing worker startups and animated GL probes in slow VDI sessions.
    await workerTest('classic', {name:'SimSim classic probe'});
    await workerTest('module', {type:'module',name:'SimSim module probe'});
    await applicationWorkerTest();
    await jsonTest();
    glTest('gl2','webgl2');glTest('gl1','webgl');
    if (location.protocol === 'file:') {
      summary.textContent = '確認終了。ただしfile:での結果です。配信条件の確認には社内ポータルのURLから開いてください。';
    } else if(Object.values(results).some(r=>r.state==='timeout')){
      summary.textContent='応答を待っても確認できない項目がありました。起動の遅延と環境の非対応は、この結果だけでは区別できません。各項目の詳細を確認してください。';
    } else if (results.module.state === 'ok' && results.application.state === 'ok' && results.gl2.state === 'ok' && results.json.state==='ok') {
      summary.textContent = '本体のmodule Worker・依存モジュール・WebGL 2・静的JSONの基本動作を確認できました。';
    } else {summary.textContent = '確認終了。失敗した項目の詳細を確認してください。';}
    runButton.disabled = false;copyButton.disabled = false;running = false;updateReport();
  }
  runButton.addEventListener('click',run);
  copyButton.addEventListener('click',async () => {
    const status = document.getElementById('copy-status');
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(report.value);status.textContent = 'コピーしました。';
    } catch {
      report.focus();report.select();status.textContent = '結果を選択しました。Ctrl+C／Cmd+Cでコピーしてください。';
    }
  });
  run();
})();
