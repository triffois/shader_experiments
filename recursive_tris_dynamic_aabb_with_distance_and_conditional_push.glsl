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
const int MAX_ARRAY_SIZE = 40;
const float WEIGHT_THRESHOLD = 0.01;

struct Ray {
  vec3 origin;
  vec3 direction;
};

struct MaterialProperties {
  vec3 color;
  vec3 reflectivity;
};

struct Intersection {
  bool happened;
  float distance;
  vec3 position;
  vec3 normal;
  MaterialProperties material;
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

struct Light {
  vec3 position;
  vec3 color;
};

struct Scene {
  Light lights[MAX_ARRAY_SIZE];
  int light_count;
};

float intersectAABB(Ray ray, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / ray.direction;
  vec3 t0s = (boxMin - ray.origin) * invDir;
  vec3 t1s = (boxMax - ray.origin) * invDir;
  vec3 tsmaller = min(t0s, t1s);
  vec3 tbigger = max(t0s, t1s);
  float tmin = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
  float tmax = min(min(tbigger.x, tbigger.y), tbigger.z);
  if (tmax >= tmin) {
    return tmin;
  }
  return -1.0;
};

Intersection intersectTriangle(Ray ray, Triangle triangle) {
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
    return Intersection(false, 0.0, vec3(0), vec3(0),
                        MaterialProperties(vec3(0), vec3(0)));
  }

  float f = 1.0 / a;
  vec3 s = ray.origin - triangle.v0.xyz;
  float u = f * dot(s, h);
  if (u < 0.0 || u > 1.0) {
    return Intersection(false, 0.0, vec3(0), vec3(0),
                        MaterialProperties(vec3(0), vec3(0)));
  }
  vec3 q = cross(s, edge1);
  float v = f * dot(ray.direction, q);
  if (v < 0.0 || u + v > 1.0) {
    return Intersection(false, 0.0, vec3(0), vec3(0),
                        MaterialProperties(vec3(0), vec3(0)));
  }
  float t = f * dot(edge2, q);
  if (t < 0.0) {
    return Intersection(false, 0.0, vec3(0), vec3(0),
                        MaterialProperties(vec3(0), vec3(0)));
  }
  return Intersection(true, t, ray.origin + t * ray.direction, normal,
                      MaterialProperties(vec3(1), vec3(0)));
}

Intersection intersectScene(Ray ray, Scene scene) {
  Intersection closestIntersection = Intersection(
      false, 0.0, vec3(0), vec3(0), MaterialProperties(vec3(0), vec3(0)));

  // Check whether we intersect the scene at all
  if (intersectAABB(ray, boxes[root_id].min.xyz, boxes[root_id].max.xyz) < 0) {
    return closestIntersection;
  }

  // Create a stack for the boxes as IDs - we need to check
  int stack[MAX_ARRAY_SIZE];
  stack[0] = root_id;
  int stack_size = 1;

  while (stack_size > 0) {
    // Pop
    stack_size--;
    int box_id = stack[stack_size];

    Box box = boxes[box_id];

    if (box.left_id == -1 || (stack_size + 1) >= MAX_ARRAY_SIZE) {
      // Iterate over triangles
      for (int i = box.start; i < box.end; i++) {
        Triangle triangle = triangles[i];
        Intersection intersection = intersectTriangle(ray, triangle);
        closestIntersection =
            closerIntersection(closestIntersection, intersection);
      }
    } else {
      // Determine which child is closer to the ray origin
      float left_distance = intersectAABB(ray, boxes[box.left_id].min.xyz,
                                          boxes[box.left_id].max.xyz);
      float right_distance = intersectAABB(ray, boxes[box.right_id].min.xyz,
                                           boxes[box.right_id].max.xyz);

      bool left_intersected =
          left_distance >= 0 && (left_distance < closestIntersection.distance ||
                                 !closestIntersection.happened);
      bool right_intersected = right_distance >= 0 &&
                               (right_distance < closestIntersection.distance ||
                                !closestIntersection.happened);

      // If there is <= 1 intersection, we can skip the boxes
      if (!left_intersected && !right_intersected) {
        continue;
      }
      if (!left_intersected) {
        stack[stack_size] = box.right_id;
        stack_size++;
        continue;
      }
      if (!right_intersected) {
        stack[stack_size] = box.left_id;
        stack_size++;
        continue;
      }

      // We visit the closer one first
      // therefore it's on top of the stack now
      if (left_distance < right_distance) {
        stack[stack_size] = box.right_id;
        stack_size++;
        stack[stack_size] = box.left_id;
        stack_size++;
      } else {
        stack[stack_size] = box.left_id;
        stack_size++;
        stack[stack_size] = box.right_id;
        stack_size++;
      }
    }
  }

  return closestIntersection;
}

struct NextCast {
  bool happened;
  vec3 accumulated_color;
  vec3 accumulated_weight;
  Ray next_ray;
};

NextCast castRay(Ray ray, Scene scene) {
  Intersection intersection = intersectScene(ray, scene);
  if (!intersection.happened) {
    return NextCast(false, vec3(0), vec3(0), Ray(vec3(0), vec3(0)));
  }

  vec3 accumulated_intensity = vec3(0);
  for (int i = 0; i < scene.light_count; i++) {
    vec3 light_direction =
        normalize(scene.lights[i].position - intersection.position);
    float light_distance =
        length(scene.lights[i].position - intersection.position);
    Ray shadow_ray = Ray(intersection.position + 0.001 * intersection.normal,
                         light_direction);
    Intersection shadow_intersection = intersectScene(shadow_ray, scene);
    if (!shadow_intersection.happened ||
        shadow_intersection.distance > light_distance) {
      float diffuse = max(0.0, dot(intersection.normal, light_direction));
      accumulated_intensity +=
          diffuse * scene.lights[i].color / light_distance / light_distance;
    }
  }

  return NextCast(
      true, accumulated_intensity * intersection.material.color,
      intersection.material.reflectivity,
      Ray(intersection.position, reflect(ray.direction, intersection.normal)));
}

Ray cameraRay(vec2 uv, vec2 resolution, vec3 origin) {
  vec3 ray_origin = vec3(0);
  vec2 sensor_size = vec2(resolution.x / resolution.y, 1);
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, -FOCAL_LENGTH);
  return Ray(origin, normalize(point_on_sensor - ray_origin));
}

vec3 renderRay(Ray ray, Scene scene) {
  vec3 accumulated_color = vec3(0);
  vec3 accumulated_weight = vec3(1);
  for (int i = 0; i < MAX_BOUNCES; i++) {
    NextCast next_cast = castRay(ray, scene);
    if (!next_cast.happened) {
      return accumulated_color;
    }
    accumulated_color += accumulated_weight * next_cast.accumulated_color;
    accumulated_weight *= next_cast.accumulated_weight;
    ray = next_cast.next_ray;
    if (dot(accumulated_weight, vec3(1)) < WEIGHT_THRESHOLD) {
      return accumulated_color;
    }
  }
  return accumulated_color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;

  Light[MAX_ARRAY_SIZE] lights;
  lights[0] = Light(vec3(0, 5, 5), vec3(25.0));

  Scene scene = Scene(lights, 1);

  Ray ray = cameraRay(uv, iResolution.xy,
                      vec3(2 * sin(iTime / 10), 2 * cos(iTime / 10), 5));
  vec3 col = renderRay(ray, scene);

  fragColor = vec4(col, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
