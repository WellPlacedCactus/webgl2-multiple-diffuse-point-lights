
// ------------------------------------------------------------------------------------------ //
const vsSource = `#version 300 es
precision highp float;

layout(location = 0) in vec3 vPosition;
layout(location = 1) in vec3 vNormal;

uniform mat4 proj;
uniform mat4 view;
uniform mat4 model;

out vec3 fPosition;
out vec3 fNormal;

void main()
{
  gl_Position = proj * view * model * vec4(vPosition, 1.0);
  fPosition = (model * vec4(vPosition, 1.0)).xyz;
  fNormal = transpose(inverse(mat3(model))) * vNormal;
}
`;

const fsSource = `#version 300 es
precision highp float;

struct Light
{
  vec3 position;
  vec3 color;
  float intensity;
};

in vec3 fPosition;
in vec3 fNormal;

uniform int numLights;
uniform Light lights[69];

out vec4 finalColor;

vec3 calcLight(vec3 normal, Light light, float constant, float linear, float quad)
{
  vec3 fragToLight = normalize(light.position - fPosition);
  float strength = max(dot(normal, fragToLight), 0.0);
  float distance = length(light.position - fPosition);
  float attenuation = 1.0 / (constant + linear * distance + quad * distance * distance);
  return light.color * strength * attenuation * light.intensity;
}

void main()
{
  vec3 light = vec3(0.1); // ambient

  // diffuse
  vec3 normal = normalize(fNormal);
  float constant = 1.0;
  float linear = 0.09;
  float quad = 0.032;
  for (int i = 0; i < numLights; i++)
  {
    light += calcLight(normal, lights[i], constant, linear, quad);
  }

  finalColor = vec4(light, 1.f);
}
`;

// ------------------------------------------------------------------------------------------ //
class Geom {
  constructor(positions, normals, indices) {
    this.positions = positions;
    this.normals = normals;
    this.indices = indices;
    this.vao = gl.createVertexArray();

    // VBOs
    const positionsVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionsVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const normalsVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalsVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // VAO
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionsVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalsVBO);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const indicesEBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesEBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    gl.bindVertexArray(null);
  }
}

// ------------------------------------------------------------------------------------------ //
class Ent {
  constructor(position, rotation, scale) {
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.modelMat = glMatrix.mat4.create();
  }
  move(x, y, z, dt) {
    this.position[0] += x * dt;
    this.position[1] += y * dt;
    this.position[2] += z * dt;
  }
  rotate(x, y, z, dt) {
    this.rotation[0] += x * dt;
    this.rotation[1] += y * dt;
    this.rotation[2] += z * dt;
  }
  grow(x, y, z, dt) {
    this.scale[0] += x * dt;
    this.scale[1] += y * dt;
    this.scale[2] += z * dt;
  }
  getModelMat() {
    glMatrix.mat4.identity(this.modelMat);
    glMatrix.mat4.translate(this.modelMat, this.modelMat, this.position);
    glMatrix.mat4.rotate(this.modelMat, this.modelMat, this.rotation[0], [1, 0, 0]);
    glMatrix.mat4.rotate(this.modelMat, this.modelMat, this.rotation[1], [0, 1, 0]);
    glMatrix.mat4.rotate(this.modelMat, this.modelMat, this.rotation[2], [0, 0, 1]);
    glMatrix.mat4.scale(this.modelMat, this.modelMat, this.scale);
    return this.modelMat;
  }
}

// ------------------------------------------------------------------------------------------ //
class Light {
  constructor(position, color, intensity) {
    this.position = position;
    this.color = color;
    this.intensity = intensity;
  }
}

// ------------------------------------------------------------------------------------------ //
class Renderer {
  constructor() {}
  renderLights(lights) {
    gl.uniform1i(gl.getUniformLocation(program, 'numLights'), lights.length);
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      gl.uniform3fv(gl.getUniformLocation(program, `lights[${i}].position`), l.position);
      gl.uniform3fv(gl.getUniformLocation(program, `lights[${i}].color`), l.color);
      gl.uniform1f(gl.getUniformLocation(program, `lights[${i}].intensity`), l.intensity);
    }
  }
  renderEnts(geom, ents) {
    gl.bindVertexArray(geom.vao);
    ents.forEach(e => {
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, e.getModelMat());
      gl.drawElements(gl.TRIANGLES, geom.indices.length, gl.UNSIGNED_SHORT, 0);
    });
    gl.bindVertexArray(null);
  }
}

// ------------------------------------------------------------------------------------------ //
class Camera {
  constructor() {
    this.viewMat = glMatrix.mat4.create();
    this.projMat = glMatrix.mat4.create();
    this.position = glMatrix.vec3.create();
    this.forward = glMatrix.vec3.create();
    this.right = glMatrix.vec3.create();
    this.target = glMatrix.vec3.create();
    this.pitch = Math.PI * 3 / 4; // Looking right at world origin
    this.yaw = -Math.PI / 2;
    glMatrix.vec3.set(this.position, 0, 10, 10); 
    this.lastX = mouse.x;
    this.lastY = mouse.y;
  }
  noclip(dt) {
    const speed = 10;
    if (keys['w']) glMatrix.vec3.scaleAndAdd(this.position, this.position, this.forward, dt * speed);
    if (keys['s']) glMatrix.vec3.scaleAndAdd(this.position, this.position, this.forward, -dt * speed);
    if (keys['d']) glMatrix.vec3.scaleAndAdd(this.position, this.position, this.right, dt * speed);
    if (keys['a']) glMatrix.vec3.scaleAndAdd(this.position, this.position, this.right, -dt * speed);
    if (keys[' ']) glMatrix.vec3.scaleAndAdd(this.position, this.position, [0, 1, 0], dt * speed);
    if (keys['c']) glMatrix.vec3.scaleAndAdd(this.position, this.position, [0, 1, 0], -dt * speed);
    if (mouse.down) {
      const dx = mouse.x - this.lastX;
      const dy = mouse.y - this.lastY;
      const sens = 0.69;
      this.yaw += dx * sens * dt;
      this.pitch += dy * sens * dt;
      if (this.pitch < 0) this.pitch = 0.001;
      if (this.pitch > Math.PI) this.pitch = Math.PI - 0.001;
    }
    this.lastX = mouse.x;
    this.lastY = mouse.y;
    if (mouse.wheel != 0) {
      glMatrix.vec3.scaleAndAdd(this.position, this.position, this.forward, -dt * speed * mouse.wheel);
      mouse.wheel = 0;
    }
  }
  getViewMat() {
    glMatrix.vec3.set(this.forward,
      Math.sin(this.pitch) * Math.cos(this.yaw),
      Math.cos(this.pitch),
      Math.sin(this.pitch) * Math.sin(this.yaw)
    );
    glMatrix.vec3.cross(this.right, this.forward, [0, 1, 0]);
    glMatrix.vec3.normalize(this.right, this.right);
    glMatrix.vec3.add(this.target, this.position, this.forward);
    glMatrix.mat4.identity(this.viewMat);
    glMatrix.mat4.lookAt(this.viewMat, this.position, this.target, [0, 1, 0]);
    return this.viewMat;
  }
  getProjMat() {
    glMatrix.mat4.identity(this.projMat);
    glMatrix.mat4.perspective(this.projMat, 70 * Math.PI / 180, canvas.width / canvas.height, 0.001, 1000);
    return this.projMat;
  }
}

// ------------------------------------------------------------------------------------------ //
const randint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randele = elements => elements[randint(0, elements.length - 1)];
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl2');
const keys = [];
const mouse = { x: 0, y: 0, down: false, wheel: 0 };
canvas.width = innerWidth;
canvas.height = innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> //

// Primitive geometries
const quad = new Geom(quadPositions, quadNormals, quadIndices);
const cube = new Geom(cubePositions, cubeNormals, cubeIndices);
const triangle = new Geom(trianglePositions, triangleNormals, triangleIndices);

// Shaders
const program = gl.createProgram();
let shader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(shader, vsSource);
gl.compileShader(shader);
if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.log(gl.getShaderInfoLog(shader));
gl.attachShader(program, shader);
gl.deleteShader(shader);
shader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(shader, fsSource);
gl.compileShader(shader);
if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.log(gl.getShaderInfoLog(shader));
gl.attachShader(program, shader);
gl.deleteShader(shader);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.log(gl.getProgramInfoLog(program));

this.camera = new Camera();
this.renderer = new Renderer();

// Spawning cubes and tiles
const tiles = [];
const cubes = [];
const gap = 0.02;
const mapSize = 20;
for (let x = -mapSize; x <= mapSize; x++) {
  for (let z = -mapSize; z <= mapSize; z++) {
    const xPos = x * (1 + gap);
    const zPos = z * (1 + gap);
    if (Math.random() < 0.05) {
      for (let y = 0; y < randint(1, 10); y++) {
        cubes.push(new Ent([xPos, 0.5 + gap + y * (1 + gap), zPos], [0, 0, 0], [1, 1, 1]));
      }
    } else {
      tiles.push(new Ent([xPos, 0, zPos], [-Math.PI / 2, 0, 0], [1, 1, 1]));
    }
  }
}

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< //
let last = performance.now();
const loop = now => {
  let dt = (now - last) / 1000;
  // console.log(1 / dt);
  dt = Math.min(dt, 50 / 1000); // clamp for tab in and out
  last = now;
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> //
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, camera.getViewMat());
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'proj'), false, camera.getProjMat());
  
  camera.noclip(dt);
  // Point lights
  this.renderer.renderLights([
    new Light([5.0, 1.0, 0.0], [1.0, 0.0, 0.0], 1.5),
    new Light([0.0, 1.0, 0.0], [0.0, 1.0, 0.0], 1.5),
    new Light([0.0, 1.0, 5.0], [0.0, 0.0, 1.0], 1.5),
    new Light([-5.0, 1.0, -5.0], [1.0, 1.0, 1.0], 3.5)
  ]);
  this.renderer.renderEnts(quad, tiles);
  this.renderer.renderEnts(cube, cubes);

  gl.useProgram(null);
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< //
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

addEventListener('resize', () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
});
addEventListener('keydown', e => keys[e.key] = true);
addEventListener('keyup', e => keys[e.key] = false);
addEventListener('mousemove', e => {
  mouse.x = e.x;
  mouse.y = e.y;
});
addEventListener('mousedown', () => mouse.down = true);
addEventListener('mouseup', () => mouse.down = false);
addEventListener('wheel', e => mouse.wheel = e.deltaY);