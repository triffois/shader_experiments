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

vec3 blinn_phong(vec3 light_dir, vec3 normal, vec3 view_dir, float shininess,
                 vec3 light_color, vec3 diffuse_color, vec3 specular_color,
                 vec3 ambient_color) {
  vec3 half_dir = normalize(light_dir + view_dir);
  float intensity = max(dot(normal, light_dir), 0.0);
  float specular = pow(max(dot(normal, half_dir), 0.0), shininess);
  return light_color * (diffuse_color * intensity + specular_color * specular) +
         ambient_color * diffuse_color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float screenGamma = 2.2;
  vec3 ambient_color = vec3(0.0); // To better showcase indirect lighting
  vec3 light_color = vec3(1.5, 0.5, 0.5);
  vec3 diffuse_color = vec3(0.1, 0.1, 1.0);
  vec3 specular_color = vec3(1.0);

  vec2 uv = fragCoord.xy / iResolution.xy;

  float focal_length = 1.0;
  float sensor_width = 2.0;
  float aspect_ratio = iResolution.x / iResolution.y;
  float sensor_height = sensor_width / aspect_ratio;

  vec3 ray_origin = vec3(0.0, 0.0, 0.0);
  vec3 point_on_sensor = vec3((uv.x - 0.5) * sensor_width,
                              (uv.y - 0.5) * sensor_height, focal_length);
  Ray ray = Ray(ray_origin, normalize(point_on_sensor - ray_origin));

  Sphere sphere = Sphere(vec3(0.0, 0.0, 3.0), 1.0);
  Intersection intersection = sphereIntersection(ray, sphere);

  if (intersection.distance < 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 light_dir = normalize(vec3(1.0, 1.0, -1.0));
  vec3 view_dir = -ray.direction;
  float shininess = 32.0;
  vec3 lighting =
      blinn_phong(light_dir, intersection.normal, view_dir, shininess,
                  light_color, diffuse_color, specular_color, ambient_color);
  vec3 color = pow(lighting, vec3(1.0 / screenGamma));

  fragColor = vec4(color, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
