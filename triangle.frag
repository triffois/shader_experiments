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

struct Triangle {
  vec3 v0;
  vec3 v1;
  vec3 v2;
};

bool triangleIntersection(Ray ray, Triangle triangle) {
  vec3 edge1 = triangle.v1 - triangle.v0;
  vec3 edge2 = triangle.v2 - triangle.v0;
  vec3 h = cross(ray.direction, edge2);
  float a = dot(edge1, h);
  if (a > -0.00001 && a < 0.00001) {
    return false;
  }
  float f = 1.0 / a;
  vec3 s = ray.origin - triangle.v0;
  float u = f * dot(s, h);
  if (u < 0.0 || u > 1.0) {
    return false;
  }
  vec3 q = cross(s, edge1);
  float v = f * dot(ray.direction, q);
  if (v < 0.0 || u + v > 1.0) {
    return false;
  }
  float t = f * dot(edge2, q);
  return t > 0.00001;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;

  float focal_length = 1.0;
  float sensor_width = 2.0;
  float aspect_ratio = iResolution.x / iResolution.y;
  float sensor_height = sensor_width / aspect_ratio;

  vec3 ray_origin = vec3(0.0, 0.0, -5);
  vec3 point_on_sensor = vec3((uv.x - 0.5) * sensor_width,
                              (uv.y - 0.5) * sensor_height, focal_length);
  Ray ray = Ray(ray_origin, normalize(point_on_sensor - ray_origin));

  Triangle triangle = Triangle(vec3(-1.0, -1.0, 0.0), vec3(1.0, -1.0, 0.0),
                               vec3(0.0, 1.0, 0.0));
  bool hit = triangleIntersection(ray, triangle);
  fragColor = vec4(hit ? vec3(1.0) : vec3(0.0), 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
