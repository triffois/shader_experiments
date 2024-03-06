#version 330 core
out vec4 FragColor;
in vec4 gl_FragCoord;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;

struct Ray {
  vec3 origin;
  vec3 direction;
};

struct Intersection {
  float distance; // -1.0 if no intersection
  vec3 position;
  vec3 normal;
};

struct Sphere {
  vec3 center;
  float radius;
};

Intersection sphereIntersection(Ray ray, Sphere sphere) {
  vec3 oc = ray.origin - sphere.center;

  float a = dot(ray.direction, ray.direction);
  float b = 2.0 * dot(oc, ray.direction);
  float c = dot(oc, oc) - sphere.radius * sphere.radius;

  float discriminant = b * b - 4.0 * a * c;

  if (discriminant < 0.0) {
    return Intersection(-1.0, vec3(0.0), vec3(0.0));
  }

  float t = (-b - sqrt(discriminant)) / (2.0 * a);
  vec3 offset = oc + ray.direction * t;
  return Intersection(t, sphere.center + offset, normalize(offset));
}

Intersection groundPlaneIntersection(Ray ray) {
  float vertical_offset = 0.5;
  // y = 0
  // normal = (0, 1, 0)
  // ray.origin + t * ray.direction = (x, 0, z)
  // t = -ray.origin.y / ray.direction.y
  // intersection = ray.origin + t * ray.direction
  float t = -(ray.origin.y + vertical_offset) / ray.direction.y;
  if (t < 0.0) {
    return Intersection(-1.0, vec3(0.0), vec3(0.0));
  }
  vec3 position = ray.origin + t * ray.direction;
  return Intersection(t, position, vec3(0.0, 1.0, 0.0));
}

vec3 blinn_phong(vec3 light_dir, vec3 normal, vec3 view_dir, float shininess,
                 vec3 light_color, vec3 diffuse_color, vec3 specular_color,
                 vec3 ambient_color) {
  vec3 half_dir = normalize(light_dir + view_dir);
  float intensity = max(dot(normal, light_dir), 0.0);
  float specular = pow(max(dot(normal, half_dir), 0.0), shininess);
  return light_color * (diffuse_color * intensity + specular_color * specular) +
         ambient_color * diffuse_color;
}

Intersection reflectionPlaneIntersection(Ray ray) {
  float x_offset = 1.0;
  float t = -(ray.origin.x + x_offset) / ray.direction.x;
  if (t < 0.0) {
    return Intersection(-1.0, vec3(0.0), vec3(0.0));
  }
  vec3 position = ray.origin + t * ray.direction;
  return Intersection(t, position, vec3(1.0, 0.0, 0.0));
}

vec3 sphere_color(Ray ray, Intersection intersection) {
  vec3 ambient_color = vec3(0.1);
  vec3 light_color = vec3(1.5, 0.5, 0.5);
  vec3 diffuse_color = vec3(0.1, 0.1, 1.0);
  vec3 specular_color = vec3(1.0);

  vec3 light_dir = normalize(vec3(1.0, 1.0, -1.0));
  vec3 view_dir = -ray.direction;
  float shininess = 32.0;
  return blinn_phong(light_dir, intersection.normal, view_dir, shininess,
                     light_color, diffuse_color, specular_color, ambient_color);
}

vec3 plane_color(Ray ray, Intersection intersection, Sphere sphere) {
  vec3 ambient_color = vec3(0.1);
  vec3 light_color = vec3(1.5, 0.5, 0.5);
  vec3 diffuse_color = vec3(0.1, 0.1, 1.0);
  vec3 specular_color = vec3(1.0);

  vec3 light_dir = normalize(vec3(1.0, 1.0, -1.0));
  vec3 view_dir = -ray.direction;
  float shininess = 32.0;

  // We'll send a ray into the sphere to calculate shadows
  Ray shadow_ray = Ray(intersection.position, light_dir);

  if (sphereIntersection(shadow_ray, sphere).distance > 0.0) {
    return ambient_color * diffuse_color;
  }

  return blinn_phong(light_dir, intersection.normal, view_dir, shininess,
                     light_color, diffuse_color, specular_color, ambient_color);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float screenGamma = 2.2;

  vec2 uv = fragCoord.xy / iResolution.xy;

  float focal_length = 1.0;
  float sensor_width = 2.0;
  float aspect_ratio = iResolution.x / iResolution.y;
  float sensor_height = sensor_width / aspect_ratio;

  vec3 ray_origin = vec3(0.0, 0.0, 0.0);
  vec3 point_on_sensor = vec3((uv.x - 0.5) * sensor_width,
                              (uv.y - 0.5) * sensor_height, focal_length);
  Ray ray = Ray(ray_origin, normalize(point_on_sensor - ray_origin));

  Sphere sphere = Sphere(vec3(sin(iTime), cos(iTime), 4.0), 1.0);
  Intersection sphere_intersection = sphereIntersection(ray, sphere);
  Intersection ground_plane_intersection = groundPlaneIntersection(ray);
  Intersection reflection_plane_intersection = reflectionPlaneIntersection(ray);

  vec3 reflection_multiplier = vec3(0.2, 1, 0.5);
  vec3 reflection_accumulator = vec3(1);

  while (reflection_plane_intersection.distance > 0.0 &&
         ((sphere_intersection.distance < 0.0 ||
           sphere_intersection.distance >
               reflection_plane_intersection.distance) &&
          (ground_plane_intersection.distance < 0.0 ||
           ground_plane_intersection.distance >
               reflection_plane_intersection.distance))) {
    ray = Ray(reflection_plane_intersection.position,
              reflect(ray.direction, reflection_plane_intersection.normal));
    sphere_intersection = sphereIntersection(ray, sphere);
    ground_plane_intersection = groundPlaneIntersection(ray);
    reflection_plane_intersection = reflectionPlaneIntersection(ray);
    reflection_accumulator *= reflection_multiplier;
  }

  if (sphere_intersection.distance < 0.0 &&
      ground_plane_intersection.distance < 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 color;

  if (sphere_intersection.distance < 0.0 ||
      (ground_plane_intersection.distance > 0.0 &&
       ground_plane_intersection.distance < sphere_intersection.distance)) {
    color = plane_color(ray, ground_plane_intersection, sphere);
  } else {
    color = sphere_color(ray, sphere_intersection);
  }

  color *= reflection_accumulator;

  fragColor = vec4(pow(color, vec3(1.0 / screenGamma)), 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
