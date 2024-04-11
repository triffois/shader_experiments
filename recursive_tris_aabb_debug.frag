#version 430 core
out vec4 FragColor;
in vec4 gl_FragCoord;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
uniform int triangle_count;
uniform int root_id;

struct Triangle {
  vec4 v0;
  vec4 v1;
  vec4 v2;
  vec4 min;
  vec4 max;
};

struct Box {
  vec4 min;
  vec4 max;
  int left_id;
  int right_id;
  int start;
  int end;
};

layout(std430, binding = 3) buffer triangles_ssbo { Triangle triangles[]; };

layout(std430, binding = 4) buffer boxes_ssbo { Box boxes[]; };

const int MAX_BOUNCES = 4;
const float FOCAL_LENGTH = 1.0;
const int MAX_ARRAY_SIZE = 25;
const float WEIGHT_THRESHOLD = 0.01;

struct Ray {
  vec3 origin;
  vec3 direction;
};

struct Intersection {
  bool happened;
  float distance;
  int n_bbox;
};

Intersection closerIntersection(Intersection a, Intersection b) {
  if (!a.happened) {
    return b;
  }
  if (!b.happened) {
    return a;
  }
  return a.distance < b.distance ? a : b;
}

bool intersectAABB(Ray ray, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / ray.direction;
  vec3 t0s = (boxMin - ray.origin) * invDir;
  vec3 t1s = (boxMax - ray.origin) * invDir;
  vec3 tsmaller = min(t0s, t1s);
  vec3 tbigger = max(t0s, t1s);
  float tmin = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
  float tmax = min(min(tbigger.x, tbigger.y), tbigger.z);
  return tmax >= tmin;
};

Intersection intersectTriangle(Ray ray, Triangle triangle, int n_bbox) {
  vec3 edge1 = triangle.v1.xyz - triangle.v0.xyz;
  vec3 edge2 = triangle.v2.xyz - triangle.v0.xyz;

  vec3 normal = normalize(cross(edge1, edge2));
  if (dot(normal, ray.direction) > 0) {
    // return Intersection(false, 0.0, vec3(0), vec3(0),
    //                     MaterialProperties(vec3(0), vec3(0)));
    // We aren't gonna do backface culling because that makes shadows
    // slightly more difficult to implement and debug.
    normal = -normal;
  }

  vec3 h = cross(ray.direction, edge2);
  float a = dot(edge1, h);
  if (a > -0.00001 && a < 0.00001) {
    return Intersection(false, 0.0, n_bbox);
  }

  float f = 1.0 / a;
  vec3 s = ray.origin - triangle.v0.xyz;
  float u = f * dot(s, h);
  if (u < 0.0 || u > 1.0) {
    return Intersection(false, 0.0, n_bbox);
  }
  vec3 q = cross(s, edge1);
  float v = f * dot(ray.direction, q);
  if (v < 0.0 || u + v > 1.0) {
    return Intersection(false, 0.0, n_bbox);
  }
  float t = f * dot(edge2, q);
  if (t < 0.0) {
    return Intersection(false, 0.0, n_bbox);
  }
  return Intersection(true, t, n_bbox);
}

Intersection intersectScene(Ray ray) {
  Intersection closestIntersection = Intersection(false, 0.0, 0);

  // Create a stack for the boxes as IDs - we need to check
  int stack[MAX_ARRAY_SIZE];
  stack[0] = root_id;
  int stack_size = 1;

  int n_bboxes = 0;

  while (stack_size > 0) {
    // Pop
    stack_size--;
    int box_id = stack[stack_size];

    Box box = boxes[box_id];
    if (!intersectAABB(ray, box.min.xyz, box.max.xyz)) {
      continue;
    }
    n_bboxes++;

    if (box.left_id == -1 || (stack_size + 1) >= MAX_ARRAY_SIZE) {
      // Iterate over triangles
      for (int i = box.start; i < box.end; i++) {
        Triangle triangle = triangles[i];
        Intersection intersection = intersectTriangle(ray, triangle, 0);
        closestIntersection =
            closerIntersection(closestIntersection, intersection);
      }
    } else {
      // Push children
      stack[stack_size] = box.left_id;
      stack_size++;
      stack[stack_size] = box.right_id;
      stack_size++;
    }
  }

  closestIntersection.n_bbox = n_bboxes;
  return closestIntersection;
}

Ray cameraRay(vec2 uv, vec2 resolution, vec3 origin) {
  vec3 ray_origin = vec3(0);
  vec2 sensor_size = vec2(resolution.x / resolution.y, 1);
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, -FOCAL_LENGTH);
  return Ray(origin, normalize(point_on_sensor - ray_origin));
}

vec3 renderRay(Ray ray) {
  Intersection intersection = intersectScene(ray);
  if (!intersection.happened) {
    return vec3(0);
  }
  return vec3(1, float(intersection.n_bbox) / 128.0,
              float(triangle_count) / 64.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;

  Ray ray = cameraRay(uv, iResolution.xy,
                      vec3(2 * sin(iTime / 10), 2 * cos(iTime / 10), 5));
  vec3 col = renderRay(ray);

  fragColor = vec4(col, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
