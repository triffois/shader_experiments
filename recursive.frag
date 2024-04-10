#version 330 core
out vec4 FragColor;
in vec4 gl_FragCoord;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;

const int MAX_BOUNCES = 4;
const vec3 CAMERA_ORIGIN = vec3(0, 0, -5);
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

struct Sphere {
  vec3 center;
  float radius;
  MaterialProperties material;
};

struct Light {
  vec3 position;
  vec3 color;
};

struct Scene {
  Sphere spheres[MAX_ARRAY_SIZE];
  int sphere_count;
  Light lights[MAX_ARRAY_SIZE];
  int light_count;
};

Intersection intersectSphere(Ray ray, Sphere sphere) {
  vec3 oc = ray.origin - sphere.center;
  float a = dot(ray.direction, ray.direction);
  float b = 2.0 * dot(oc, ray.direction);
  float c = dot(oc, oc) - sphere.radius * sphere.radius;
  float discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return Intersection(false, 0.0, vec3(0), vec3(0),
                        MaterialProperties(vec3(0), vec3(0)));
  }
  float t = (-b - sqrt(discriminant)) / (2.0 * a);
  if (t < 0.0) {
    return Intersection(false, 0.0, vec3(0), vec3(0),
                        MaterialProperties(vec3(0), vec3(0)));
  }
  vec3 position = ray.origin + t * ray.direction;
  vec3 normal = (position - sphere.center) / sphere.radius;
  return Intersection(true, t, position, normal, sphere.material);
}

Intersection intersectScene(Ray ray, Scene scene) {
  Intersection closestIntersection = Intersection(
      false, 0.0, vec3(0), vec3(0), MaterialProperties(vec3(0), vec3(0)));

  for (int i = 0; i < scene.sphere_count; i++) {
    closestIntersection = closerIntersection(
        closestIntersection, intersectSphere(ray, scene.spheres[i]));
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

Ray cameraRay(vec2 uv, vec2 resolution) {
  vec3 ray_origin = vec3(0);
  vec2 sensor_size = vec2(resolution.x / resolution.y, 1);
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, FOCAL_LENGTH);
  return Ray(CAMERA_ORIGIN, normalize(point_on_sensor - ray_origin));
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

  Sphere[MAX_ARRAY_SIZE] spheres;
  spheres[0] =
      Sphere(vec3(0, 0, 0), 1.0, MaterialProperties(vec3(0.5), vec3(0.5)));
  spheres[1] =
      Sphere(vec3(2, 0, -2), 1.0,
             MaterialProperties(vec3(0.0, 0.5, 0.0), vec3(0.0, 0.5, 0.0)));
  spheres[2] =
      Sphere(vec3(-2, 0, 0), 1.0,
             MaterialProperties(vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, 0.0)));

  Light[MAX_ARRAY_SIZE] lights;
  lights[0] = Light(vec3(0, 5, -5), vec3(100.0));
  lights[1] = Light(vec3(0, -5, -5), vec3(10));

  Scene scene = Scene(spheres, 3, lights, 2);

  Ray ray = cameraRay(uv, iResolution.xy);
  vec3 col = renderRay(ray, scene);

  fragColor = vec4(col, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
