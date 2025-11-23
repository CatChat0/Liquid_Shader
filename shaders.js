window.LiquidGlassShaders = {
  vertex: `
    attribute vec2 a_position;
    varying vec2 v_uv;

    void main() {
      v_uv = vec2(a_position.x, -a_position.y) * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `,
  fragment: `
    precision highp float;
    uniform float u_dpr;
    uniform sampler2D u_background;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform vec2 u_size;
    varying vec2 v_uv;

    const float M_E = 2.718281828459045;
    
    float sdSuperellipse(vec2 p, float n, float r) {
      vec2 p_abs = abs(p);
      float numerator = pow(p_abs.x, n) + pow(p_abs.y, n) - pow(r, n);
      float den_x = pow(p_abs.x, 2.0 * n - 2.0);
      float den_y = pow(p_abs.y, 2.0 * n - 2.0);
      float denominator = n * sqrt(den_x + den_y) + 0.00001;
      return numerator / denominator;
    }

    float f(float x, float a, float b, float c, float d) {
      return 1.0 - b * pow(c * M_E, -d * x - a);
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
      vec4 color = vec4(0.0);
      vec2 off1 = vec2(1.411764705882353) * direction;
      vec2 off2 = vec2(3.2941176470588234) * direction;
      vec2 off3 = vec2(5.176470588235294) * direction;
      color += texture2D(image, uv) * 0.1964825501511404;
      color += texture2D(image, uv + (off1 / resolution)) * 0.2969069646728344;
      color += texture2D(image, uv - (off1 / resolution)) * 0.2969069646728344;
      color += texture2D(image, uv + (off2 / resolution)) * 0.09447039785044732;
      color += texture2D(image, uv - (off2 / resolution)) * 0.09447039785044732;
      color += texture2D(image, uv + (off3 / resolution)) * 0.010381362401148057;
      color += texture2D(image, uv - (off3 / resolution)) * 0.010381362401148057;
      return color;
    }

    float glow(vec2 texCoord) {
      return sin(atan(texCoord.y * 2.0 - 1.0, texCoord.x * 2.0 - 1.0) - 0.5);
    }

    void main() {
      vec2 pixelUV = (v_uv * u_resolution) / u_dpr;
      vec2 center = u_mouse;
      vec2 size = u_size * 0.5;
      
      vec2 p = (pixelUV - center);
      vec2 localNorm = p / (size * 0.8);
      
      float powerFactor = 3.5;
      float r = 1.0;
      
      float d = sdSuperellipse(localNorm, powerFactor, r);
      
      if (d > 0.0) {
        gl_FragColor = texture2D(u_background, v_uv);
        return;
      }
      
      float dist = -d;
      
      float u_a = 0.5;
      float u_b = 1.8;
      float u_c = 4.0;
      float u_d = 5.0;
      float u_fPower = 2.0;
      
      float distortionFactor = pow(f(dist, u_a, u_b, u_c, u_d), u_fPower);
      vec2 distortedLocal = localNorm * distortionFactor;
      
      vec2 distortedPixel = distortedLocal * (size * 0.8) + center;
      vec2 distortedUV = distortedPixel / u_resolution * u_dpr;
      
      vec4 color = blur13(u_background, distortedUV, u_resolution, vec2(2.0, 0.0));
      
      float noise = (rand(pixelUV * 0.01) - 0.5) * 0.03;
      color.rgb += noise;
      
      float edgeGlow = smoothstep(0.15, 0.0, dist) * 0.2;
      color.rgb += edgeGlow;
      
      gl_FragColor = vec4(color.rgb, 0.85);
    }
  `,
};Retry