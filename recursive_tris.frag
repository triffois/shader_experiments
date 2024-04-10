#version 330 core
out vec4 FragColor;
in vec4 gl_FragCoord;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;

const int MAX_BOUNCES = 4;
const float FOCAL_LENGTH = 1.0;
const int MAX_ARRAY_SIZE = 10;

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

struct Triangle {
  vec3 v0;
  vec3 v1;
  vec3 v2;
  MaterialProperties material;
};

struct Light {
  vec3 position;
  vec3 color;
};

struct Scene {
  Triangle triangles[MAX_ARRAY_SIZE];
  int triangle_count;
  Light lights[MAX_ARRAY_SIZE];
  int light_count;
};

Intersection intersectTriangle(Ray ray, Triangle triangle) {
  vec3 edge1 = triangle.v1 - triangle.v0;
  vec3 edge2 = triangle.v2 - triangle.v0;

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
  vec3 s = ray.origin - triangle.v0;
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
                      triangle.material);
}

Intersection intersectScene(Ray ray, Scene scene) {
  Intersection closestIntersection = Intersection(
      false, 0.0, vec3(0), vec3(0), MaterialProperties(vec3(0), vec3(0)));

  for (int i = 0; i < scene.triangle_count; i++) {
    closestIntersection = closerIntersection(
        closestIntersection, intersectTriangle(ray, scene.triangles[i]));
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
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, FOCAL_LENGTH);
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
  }
  return accumulated_color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;

  Triangle[MAX_ARRAY_SIZE] triangles;
  triangles[0] = Triangle(vec3(-1, -1, 0), vec3(0, 1, 0), vec3(0, 0, -1),
                          MaterialProperties(vec3(0, 0, 1), vec3(0)));
  triangles[1] = Triangle(vec3(0, 1, 0), vec3(1, -1, 0), vec3(0, 0, -1),
                          MaterialProperties(vec3(0, 0, 1), vec3(0)));
  triangles[2] = Triangle(vec3(0.25, 1.25, -0.5), vec3(-0.25, 1.25, -0.5),
                          vec3(0, 1.25, -0.75),
                          MaterialProperties(vec3(1, 0, 0), vec3(0)));
  triangles[3] =
      Triangle(vec3(-100, -1, -100), vec3(100, -1, -100), vec3(0, -1, 100),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));

  Light[MAX_ARRAY_SIZE] lights;
  lights[0] = Light(vec3(5 * sin(iTime), 5, -5), vec3(100.0));
  lights[1] = Light(vec3(0, -0.5, -2), vec3(5.0, 2.5, 2.5));

  Scene scene = Scene(triangles, 4, lights, 2);

  Ray ray = cameraRay(uv, iResolution.xy, vec3(0, 0, -5));
  vec3 col = renderRay(ray, scene);

  fragColor = vec4(col, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
