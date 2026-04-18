// Shader source strings (vertex + fragment).

export const VERT_SRC = `#version 300 es
uniform mat4 u_projection;
uniform mat4 u_view;

// Instance transform
uniform vec3 u_quadPos;   // world origin
uniform vec3 u_quadScale; // (w, h, 0) for flat quads
uniform vec3 u_quadDir;   // wall direction: length along XY. (0,0,0) = flat quad mode.
uniform float u_quadZ;    // wall height (z extent)

in vec3 a_position;
out vec3 v_worldPos;

void main() {
  vec3 worldPos;
  if (u_quadDir.x != 0.0 || u_quadDir.y != 0.0) {
    // Wall mode: a_position.x = along wall, a_position.z = up
    worldPos = u_quadPos + a_position.x * u_quadDir + vec3(0.0, 0.0, a_position.z * u_quadZ);
  } else {
    // Flat quad mode: standard XY scale
    worldPos = u_quadPos + a_position * u_quadScale;
  }
  v_worldPos = worldPos;
  gl_Position = u_projection * u_view * vec4(worldPos, 1.0);
}
`;

const MAX_OCCLUDERS = 24;

export const FRAG_SRC = `#version 300 es
precision mediump float;

#define MAX_OCCLUDERS ${MAX_OCCLUDERS}

uniform vec4 u_color;
uniform vec3 u_lightPos;
uniform vec2 u_lightDir;
uniform float u_coneAngle;
uniform float u_lightInner;
uniform float u_lightOuter;
uniform float u_zScale;
uniform vec3 u_ambient;
uniform vec3 u_lightColor;
uniform float u_ambientGlow;  // how much radial light vs cone-only
uniform vec2 u_faceNormal;   // (0,0) = floor. Non-zero = wall face normal for backface darkening

uniform int u_occluderCount;
uniform vec4 u_occluders[MAX_OCCLUDERS];

in vec3 v_worldPos;
out vec4 fragColor;

// Returns shadow amount 0..1. Soft penumbra based on how deep into the shadow.
float lineTestAABB(vec2 p0, vec2 p1, vec2 bmin, vec2 bmax) {
  vec2 d = p1 - p0;
  vec2 tmin_v, tmax_v;

  for (int i = 0; i < 2; i++) {
    if (abs(d[i]) < 0.0001) {
      if (p0[i] < bmin[i] || p0[i] > bmax[i]) return 0.0;
      tmin_v[i] = -1e10;
      tmax_v[i] = 1e10;
    } else {
      float inv = 1.0 / d[i];
      float t1 = (bmin[i] - p0[i]) * inv;
      float t2 = (bmax[i] - p0[i]) * inv;
      tmin_v[i] = min(t1, t2);
      tmax_v[i] = max(t1, t2);
    }
  }

  float tenter = max(tmin_v.x, tmin_v.y);
  float texit  = min(tmax_v.x, tmax_v.y);

  if (tenter >= texit || texit <= 0.01 || tenter >= 1.0) return 0.0;

  // How deep past the occluder edge is the fragment? (in world units)
  float rayLen = length(d);
  float penetration = (min(texit, 1.0) - max(tenter, 0.01)) * rayLen;

  // Return raw penetration depth — caller controls sharpness
  return penetration;
}

void main() {
  vec2 fragXY = v_worldPos.xy;
  vec2 lightXY = u_lightPos.xy;

  // Oval light: offset center forward along light direction, compress distance behind
  float forwardShift = u_lightOuter * 0.3; // push light center ahead of player
  vec2 ovalCenter = lightXY + u_lightDir * forwardShift;

  // Compute distance in an elongated space: shorter along lightDir, normal perpendicular
  vec2 delta = fragXY - ovalCenter;
  float alongDir = dot(delta, u_lightDir);     // distance along torch direction
  vec2 perp = vec2(-u_lightDir.y, u_lightDir.x);
  float acrossDir = dot(delta, perp);           // distance perpendicular

  // Stretch: further reach along torch direction, normal reach perpendicular
  float stretchForward = 0.7;  // compress along dir = light reaches further
  float stretchBack = 1.3;     // expand behind = light drops off faster behind player
  float stretch = alongDir > 0.0 ? stretchForward : stretchBack;
  float effectiveDist2D = sqrt((alongDir * stretch) * (alongDir * stretch) + acrossDir * acrossDir);

  float dz = (v_worldPos.z - u_lightPos.z) * u_zScale;
  float dist = sqrt(effectiveDist2D * effectiveDist2D + dz * dz);

  // Distance falloff
  float distFade = smoothstep(u_lightInner, u_lightOuter, dist);
  distFade = distFade * distFade;
  float radialBrightness = 1.0 - distFade;

  // Cone boost
  vec2 toFrag = fragXY - lightXY;
  float fragDist2D = length(toFrag);
  float coneBoost = 0.0;
  if (fragDist2D > 0.5) {
    vec2 toFragDir = toFrag / fragDist2D;
    float cosAngle = dot(u_lightDir, toFragDir);
    float angle = acos(clamp(cosAngle, -1.0, 1.0));
    float innerCone = u_coneAngle * 0.6;
    coneBoost = 1.0 - smoothstep(innerCone, u_coneAngle, angle);
  }

  float ambientBrightness = radialBrightness * u_ambientGlow;
  float directBrightness = radialBrightness * coneBoost * (1.0 - u_ambientGlow);

  // Shadow test — get raw penetration depth
  float penetration = 0.0;
  for (int i = 0; i < MAX_OCCLUDERS; i++) {
    if (i >= u_occluderCount) break;
    vec4 occ = u_occluders[i];
    vec2 bmin = occ.xy;
    vec2 bmax = occ.xy + occ.zw;
    float p = lineTestAABB(lightXY, fragXY, bmin, bmax);
    penetration = max(penetration, p);
  }

  // Penumbra width depends on cone: sharp in direct beam, soft in ambient
  float sharpWidth = 8.0;   // crisp but slightly soft in cone
  float softWidth = 50.0;   // very gradual in ambient
  float penumbraWidth = mix(softWidth, sharpWidth, coneBoost);
  float shadow = smoothstep(0.0, penumbraWidth, penetration);

  // Backface check: wall faces pointing away from light are fully dark
  float faceFactor = 1.0;
  if (length(u_faceNormal) > 0.5) {
    // Use direction from panel center to light, not per-fragment
    // (per-fragment direction varies across the face and causes partial lighting)
    vec2 toLight = normalize(lightXY - fragXY);
    float ndotl = dot(u_faceNormal, toLight);
    // Hard cutoff: face must clearly point toward light to receive any
    faceFactor = ndotl > 0.05 ? 1.0 : 0.0;
  }

  float unshadowedBrightness = (ambientBrightness + directBrightness) * faceFactor;
  float brightness = unshadowedBrightness * (1.0 - shadow);
  float darkness = 1.0 - brightness;
  if (darkness > 0.97) darkness = 1.0;

  // Lit = panel color tinted by torch. Unlit = ambient (white).
  vec3 litColor = u_color.rgb * u_lightColor;
  vec3 final = mix(litColor, u_ambient, darkness);

  float alpha = darkness >= 1.0 ? 1.0 : u_color.a;
  fragColor = vec4(final, alpha);
}
`;

export { MAX_OCCLUDERS };
