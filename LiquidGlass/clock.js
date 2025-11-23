const clockDisplay = document.getElementById("clock-display");
const canvas = document.getElementById("glass-canvas");
const toggleButton = document.getElementById("toggle-clock");
const clockShell = document.querySelector(".clock-shell");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(date) {
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${hours}:${minutes}`;
}

function updateClock() {
  const now = new Date();
  const time = formatTime(now);
  clockDisplay.textContent = time;
  clockDisplay.setAttribute("data-time", time);
}

updateClock();
setInterval(updateClock, 1000);

function setupToggle() {
  if (!toggleButton || !clockShell) return;

  toggleButton.addEventListener("click", () => {
    const willHide = !clockShell.classList.contains("hidden");
    clockShell.classList.toggle("hidden", willHide);
    toggleButton.setAttribute("aria-pressed", String(willHide));
    toggleButton.textContent = willHide ? "Show clock" : "Hide clock";
  });
}

// Make clock draggable
function setupDraggable() {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  clockDisplay.style.cursor = "grab";

  clockDisplay.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);

  clockDisplay.addEventListener("touchstart", dragStart);
  document.addEventListener("touchmove", drag);
  document.addEventListener("touchend", dragEnd);

  function dragStart(e) {
    if (e.type === "touchstart") {
      initialX = e.touches[0].clientX - xOffset;
      initialY = e.touches[0].clientY - yOffset;
    } else {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
    }

    if (e.target === clockDisplay || clockDisplay.contains(e.target)) {
      isDragging = true;
      clockDisplay.style.cursor = "grabbing";
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();

      if (e.type === "touchmove") {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, clockShell);
    }
  }

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
    clockDisplay.style.cursor = "grab";
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }
}

function initGlassEffect() {
  const shaders = window.LiquidGlassShaders;
  if (!canvas || !shaders) {
    return;
  }

  const gl =
    canvas.getContext("webgl", { 
      antialias: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false 
    }) ||
    canvas.getContext("experimental-webgl", { 
      antialias: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false 
    });

  if (!gl) {
    console.warn("WebGL is not supported in this browser.");
    return;
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vShader = compileShader(gl.VERTEX_SHADER, shaders.vertex);
  const fShader = compileShader(gl.FRAGMENT_SHADER, shaders.fragment);

  if (!vShader || !fShader) {
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    mouse: gl.getUniformLocation(program, "u_mouse"),
    size: gl.getUniformLocation(program, "u_size"),
    background: gl.getUniformLocation(program, "u_background"),
    dpr: gl.getUniformLocation(program, "u_dpr"),
    time: gl.getUniformLocation(program, "u_time"),
    lightPos: gl.getUniformLocation(program, "u_lightPos"),
  };

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  // Initialize with a placeholder
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, 
                new Uint8Array([20, 20, 20, 255]));

  // Create offscreen canvas for real-time background capture
  const offscreenCanvas = document.createElement('canvas');
  const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

  let backgroundSource = null;
  let isVideo = false;
  let useRealTimeCapture = false; // Flag to enable real-time DOM capture

  // Mouse tracking for interactive lighting
  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;
  
  window.addEventListener('mousemove', (e) => {
    const rect = clockDisplay.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const size = Math.max(rect.width, rect.height) * 1.5;
    
    // Convert mouse position to normalized coordinates relative to glass center
    targetMouseX = (e.clientX - centerX) / size;
    targetMouseY = (e.clientY - centerY) / size;
  });

  // Function to set background from an image URL
  window.setBackgroundImage = function(url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
      backgroundSource = img;
      isVideo = false;
      useRealTimeCapture = false;
      updateTexture();
      console.log("Background image loaded:", url);
    };
    img.onerror = function() {
      console.error("Failed to load background image:", url);
    };
    img.src = url;
  };

  // Function to set background from a video element
  window.setBackgroundVideo = function(videoElement) {
    if (videoElement && videoElement.tagName === 'VIDEO') {
      backgroundSource = videoElement;
      isVideo = true;
      useRealTimeCapture = false;
      videoElement.play();
      console.log("Background video set");
    }
  };

  // Function to set background from a canvas element (for dynamic content)
  window.setBackgroundCanvas = function(canvasElement) {
    if (canvasElement && canvasElement.tagName === 'CANVAS') {
      backgroundSource = canvasElement;
      isVideo = false;
      useRealTimeCapture = false;
      console.log("Background canvas set");
    }
  };

  // NEW: Function to enable real-time DOM capture mode
  window.enableRealTimeCapture = function() {
    useRealTimeCapture = true;
    backgroundSource = null;
    console.log("Real-time DOM capture enabled");
  };

  // Capture real-time DOM content as background
  function captureBackground() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Set offscreen canvas size
    if (offscreenCanvas.width !== width * dpr || offscreenCanvas.height !== height * dpr) {
      offscreenCanvas.width = width * dpr;
      offscreenCanvas.height = height * dpr;
      offscreenCanvas.style.width = width + 'px';
      offscreenCanvas.style.height = height + 'px';
      offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
      offscreenCtx.scale(dpr, dpr);
    }

    // Clear the offscreen canvas
    offscreenCtx.clearRect(0, 0, width, height);

    // Render a gradient background for real-time mode
    const gradient = offscreenCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a0033');
    gradient.addColorStop(0.5, '#330066');
    gradient.addColorStop(1, '#0d001a');
    offscreenCtx.fillStyle = gradient;
    offscreenCtx.fillRect(0, 0, width, height);

    return offscreenCanvas;
  }

  function updateTexture() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    try {
      if (useRealTimeCapture) {
        // Обновление в реальном времени
        const backgroundCanvas = captureBackground();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backgroundCanvas);
      } else if (backgroundSource) {
        // Использует сурсы изображения или видео
        if (backgroundSource.tagName === 'VIDEO') {
          if (backgroundSource.readyState >= backgroundSource.HAVE_CURRENT_DATA) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backgroundSource);
          }
        } else {
          // Image or Canvas
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backgroundSource);
        }
      }
    } catch (e) {
      console.error("Error updating texture:", e);
    }
  }

  // Если существует другой бекграунд загружает его
  const defaultBg = new Image();
  defaultBg.crossOrigin = "anonymous";
  defaultBg.onload = function() {
    backgroundSource = defaultBg;
    isVideo = false;
    useRealTimeCapture = false;
    updateTexture();
    startRenderLoop();
  };
  defaultBg.onerror = function() {
    // Если нет картинки грузит видео
    const defaultVideo = document.createElement('video');
    defaultVideo.crossOrigin = "anonymous";
    defaultVideo.loop = true;
    defaultVideo.muted = true;
    defaultVideo.playsInline = true;
    defaultVideo.autoplay = true;
    
    defaultVideo.addEventListener('loadeddata', function() {
      backgroundSource = defaultVideo;
      isVideo = true;
      useRealTimeCapture = false;
      defaultVideo.play();
      updateTexture();
      startRenderLoop();
    });
    
    defaultVideo.addEventListener('error', function() {
      console.log("No default background found. Use setBackgroundImage(), setBackgroundVideo(), setBackgroundCanvas(), or enableRealTimeCapture().");
      startRenderLoop();
    });
    
    defaultVideo.src = "Background.mp4";
  };
  defaultBg.src = "Background.jpg";

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uniforms.dpr, dpr);
  }

  let startTime = Date.now();
  
  function startRenderLoop() {
    function draw() {
      // Обновляет текстуру в реальном времени
      if (useRealTimeCapture || (backgroundSource && (isVideo || backgroundSource.tagName === 'CANVAS'))) {
        updateTexture();
      }
      
      // Шобы плавно двигать можно было
      const smoothing = 0.1;
      mouseX += (targetMouseX - mouseX) * smoothing;
      mouseY += (targetMouseY - mouseY) * smoothing;
      
      resize();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, (Date.now() - startTime) * 0.001);
      gl.uniform1i(uniforms.background, 0);
      
      // Pass mouse position for interactive lighting
      gl.uniform2f(uniforms.lightPos, mouseX, mouseY);

      const rect = clockDisplay.getBoundingClientRect();
      const paddingX = 260;
      const paddingY = 190;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      gl.uniform2f(uniforms.mouse, centerX, centerY);
      gl.uniform2f(
        uniforms.size,
        rect.width + paddingX,
        rect.height + paddingY,
      );

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(draw);
    }

    draw();
  }

  window.addEventListener("resize", resize);
}

initGlassEffect();
setupToggle();
setupDraggable();