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

struct Sphere {
  vec3 center;
  float radius;
};

bool sphereIntersection(Ray ray, Sphere sphere) {
  vec3 oc = ray.origin - sphere.center;

  float a = dot(ray.direction, ray.direction);
  float b = 2.0 * dot(oc, ray.direction);
  float c = dot(oc, oc) - sphere.radius * sphere.radius;

  float discriminant = b * b - 4.0 * a * c;

  return discriminant >= 0.0;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float sensor_width = 2.0;
  float sensor_height = iResolution.y / iResolution.x * sensor_width;
  vec2 uv = fragCoord.xy / iResolution.xy;
  float focal_length = 1.0;

  vec3 ray_origin = vec3(0.0, 0.0, 0.0);
  vec3 point_on_sensor = vec3((uv.x - 0.5) * sensor_width,
                              (uv.y - 0.5) * sensor_height, focal_length);
  Ray ray = Ray(ray_origin, normalize(point_on_sensor - ray_origin));

  Sphere sphere = Sphere(vec3(0.0, 0.0, 3.0), 1.0);
  bool intersection = sphereIntersection(ray, sphere);

  if (intersection) {
    fragColor = vec4(0, 0, 0, 1);
    return;
  }

  fragColor = vec4(1);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
