#version 330 core
out vec4 FragColor;
in vec4 gl_FragCoord;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
const int MAX_BOUNCES = 4;
const float FOCAL_LENGTH = 1.0;
const int MAX_ARRAY_SIZE = 967;
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

  Light[MAX_ARRAY_SIZE] lights;
  lights[0] = Light(vec3(5 * sin(iTime), 5, -5), vec3(100.0));

  Triangle[MAX_ARRAY_SIZE] triangles;
  triangles[0] =
      Triangle(vec3(0.46875, 0.242188, -0.104583), vec3(0.5, 0.09375, -0.03427), vec3(0.5625, 0.242188, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[1] =
      Triangle(vec3(-0.5, 0.09375, -0.03427), vec3(-0.46875, 0.242188, -0.104583), vec3(-0.5625, 0.242188, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[2] =
      Triangle(vec3(0.5625, 0.242188, -0.018645), vec3(0.546875, 0.054688, 0.075105), vec3(0.625, 0.242188, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[3] =
      Triangle(vec3(-0.546875, 0.054688, 0.075105), vec3(-0.5625, 0.242188, -0.018645), vec3(-0.625, 0.242188, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[4] =
      Triangle(vec3(0.5, 0.09375, -0.03427), vec3(0.351562, -0.023438, 0.036042), vec3(0.546875, 0.054688, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[5] =
      Triangle(vec3(-0.351562, -0.023438, 0.036042), vec3(-0.5, 0.09375, -0.03427), vec3(-0.546875, 0.054688, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[6] =
      Triangle(vec3(0.4375, 0.164062, -0.112395), vec3(0.351562, 0.03125, -0.06552), vec3(0.5, 0.09375, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[7] =
      Triangle(vec3(-0.351562, 0.03125, -0.06552), vec3(-0.4375, 0.164062, -0.112395), vec3(-0.5, 0.09375, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[8] =
      Triangle(vec3(0.351562, 0.132812, -0.12802), vec3(0.203125, 0.09375, -0.088958), vec3(0.351562, 0.03125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[9] =
      Triangle(vec3(-0.203125, 0.09375, -0.088958), vec3(-0.351562, 0.132812, -0.12802), vec3(-0.351562, 0.03125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[10] =
      Triangle(vec3(0.351562, 0.03125, -0.06552), vec3(0.15625, 0.054688, 0.004792), vec3(0.351562, -0.023438, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[11] =
      Triangle(vec3(-0.15625, 0.054688, 0.004792), vec3(-0.351562, 0.03125, -0.06552), vec3(-0.351562, -0.023438, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[12] =
      Triangle(vec3(0.140625, 0.242188, -0.088958), vec3(0.15625, 0.054688, 0.004792), vec3(0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[13] =
      Triangle(vec3(-0.140625, 0.242188, -0.088958), vec3(-0.15625, 0.054688, 0.004792), vec3(-0.078125, 0.242188, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[14] =
      Triangle(vec3(0.273438, 0.164062, -0.143645), vec3(0.140625, 0.242188, -0.088958), vec3(0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[15] =
      Triangle(vec3(-0.140625, 0.242188, -0.088958), vec3(-0.273438, 0.164062, -0.143645), vec3(-0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[16] =
      Triangle(vec3(0.242188, 0.242188, -0.143645), vec3(0.203125, 0.390625, -0.088958), vec3(0.140625, 0.242188, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[17] =
      Triangle(vec3(-0.203125, 0.390625, -0.088958), vec3(-0.242188, 0.242188, -0.143645), vec3(-0.140625, 0.242188, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[18] =
      Triangle(vec3(0.203125, 0.390625, -0.088958), vec3(0.078125, 0.242188, -0.00302), vec3(0.140625, 0.242188, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[19] =
      Triangle(vec3(-0.203125, 0.390625, -0.088958), vec3(-0.078125, 0.242188, -0.00302), vec3(-0.15625, 0.4375, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[20] =
      Triangle(vec3(0.351562, 0.453125, -0.06552), vec3(0.15625, 0.4375, 0.004792), vec3(0.203125, 0.390625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[21] =
      Triangle(vec3(-0.351562, 0.453125, -0.06552), vec3(-0.15625, 0.4375, 0.004792), vec3(-0.351562, 0.515625, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[22] =
      Triangle(vec3(0.351562, 0.359375, -0.12802), vec3(0.203125, 0.390625, -0.088958), vec3(0.273438, 0.328125, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[23] =
      Triangle(vec3(-0.351562, 0.359375, -0.12802), vec3(-0.203125, 0.390625, -0.088958), vec3(-0.351562, 0.453125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[24] =
      Triangle(vec3(0.4375, 0.328125, -0.112395), vec3(0.351562, 0.453125, -0.06552), vec3(0.351562, 0.359375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[25] =
      Triangle(vec3(-0.4375, 0.328125, -0.112395), vec3(-0.351562, 0.453125, -0.06552), vec3(-0.5, 0.390625, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[26] =
      Triangle(vec3(0.5, 0.390625, -0.03427), vec3(0.351562, 0.515625, 0.036042), vec3(0.351562, 0.453125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[27] =
      Triangle(vec3(-0.5, 0.390625, -0.03427), vec3(-0.351562, 0.515625, 0.036042), vec3(-0.546875, 0.4375, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[28] =
      Triangle(vec3(0.5625, 0.242188, -0.018645), vec3(0.546875, 0.4375, 0.075105), vec3(0.5, 0.390625, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[29] =
      Triangle(vec3(-0.5625, 0.242188, -0.018645), vec3(-0.546875, 0.4375, 0.075105), vec3(-0.625, 0.242188, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[30] =
      Triangle(vec3(0.46875, 0.242188, -0.104583), vec3(0.5, 0.390625, -0.03427), vec3(0.4375, 0.328125, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[31] =
      Triangle(vec3(-0.46875, 0.242188, -0.104583), vec3(-0.5, 0.390625, -0.03427), vec3(-0.5625, 0.242188, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[32] =
      Triangle(vec3(0.4375, 0.328125, -0.112395), vec3(0.476562, 0.242188, -0.120208), vec3(0.46875, 0.242188, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[33] =
      Triangle(vec3(-0.4375, 0.328125, -0.112395), vec3(-0.476562, 0.242188, -0.120208), vec3(-0.445312, 0.335938, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[34] =
      Triangle(vec3(0.351562, 0.359375, -0.12802), vec3(0.445312, 0.335938, -0.12802), vec3(0.4375, 0.328125, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[35] =
      Triangle(vec3(-0.351562, 0.359375, -0.12802), vec3(-0.445312, 0.335938, -0.12802), vec3(-0.351562, 0.375, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[36] =
      Triangle(vec3(0.273438, 0.328125, -0.143645), vec3(0.351562, 0.375, -0.151458), vec3(0.351562, 0.359375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[37] =
      Triangle(vec3(-0.273438, 0.328125, -0.143645), vec3(-0.351562, 0.375, -0.151458), vec3(-0.265625, 0.335938, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[38] =
      Triangle(vec3(0.242188, 0.242188, -0.143645), vec3(0.265625, 0.335938, -0.167083), vec3(0.273438, 0.328125, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[39] =
      Triangle(vec3(-0.242188, 0.242188, -0.143645), vec3(-0.265625, 0.335938, -0.167083), vec3(-0.226562, 0.242188, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[40] =
      Triangle(vec3(0.242188, 0.242188, -0.143645), vec3(0.265625, 0.15625, -0.167083), vec3(0.226562, 0.242188, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[41] =
      Triangle(vec3(-0.265625, 0.15625, -0.167083), vec3(-0.242188, 0.242188, -0.143645), vec3(-0.226562, 0.242188, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[42] =
      Triangle(vec3(0.273438, 0.164062, -0.143645), vec3(0.351562, 0.117188, -0.151458), vec3(0.265625, 0.15625, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[43] =
      Triangle(vec3(-0.351562, 0.117188, -0.151458), vec3(-0.273438, 0.164062, -0.143645), vec3(-0.265625, 0.15625, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[44] =
      Triangle(vec3(0.351562, 0.132812, -0.12802), vec3(0.445312, 0.15625, -0.12802), vec3(0.351562, 0.117188, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[45] =
      Triangle(vec3(-0.445312, 0.15625, -0.12802), vec3(-0.351562, 0.132812, -0.12802), vec3(-0.351562, 0.117188, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[46] =
      Triangle(vec3(0.4375, 0.164062, -0.112395), vec3(0.476562, 0.242188, -0.120208), vec3(0.445312, 0.15625, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[47] =
      Triangle(vec3(-0.476562, 0.242188, -0.120208), vec3(-0.4375, 0.164062, -0.112395), vec3(-0.445312, 0.15625, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[48] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.445312, 0.15625, -0.12802), vec3(0.476562, 0.242188, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[49] =
      Triangle(vec3(-0.476562, 0.242188, -0.120208), vec3(-0.445312, 0.15625, -0.12802), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[50] =
      Triangle(vec3(0.351562, 0.117188, -0.151458), vec3(0.445312, 0.15625, -0.12802), vec3(0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[51] =
      Triangle(vec3(-0.351562, 0.242188, -0.174895), vec3(-0.445312, 0.15625, -0.12802), vec3(-0.351562, 0.117188, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[52] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.265625, 0.15625, -0.167083), vec3(0.351562, 0.117188, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[53] =
      Triangle(vec3(-0.351562, 0.117188, -0.151458), vec3(-0.265625, 0.15625, -0.167083), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[54] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.226562, 0.242188, -0.167083), vec3(0.265625, 0.15625, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[55] =
      Triangle(vec3(-0.265625, 0.15625, -0.167083), vec3(-0.226562, 0.242188, -0.167083), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[56] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.265625, 0.335938, -0.167083), vec3(0.226562, 0.242188, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[57] =
      Triangle(vec3(-0.226562, 0.242188, -0.167083), vec3(-0.265625, 0.335938, -0.167083), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[58] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.351562, 0.375, -0.151458), vec3(0.265625, 0.335938, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[59] =
      Triangle(vec3(-0.265625, 0.335938, -0.167083), vec3(-0.351562, 0.375, -0.151458), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[60] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.445312, 0.335938, -0.12802), vec3(0.351562, 0.375, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[61] =
      Triangle(vec3(-0.351562, 0.375, -0.151458), vec3(-0.445312, 0.335938, -0.12802), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[62] =
      Triangle(vec3(0.351562, 0.242188, -0.174895), vec3(0.476562, 0.242188, -0.120208), vec3(0.445312, 0.335938, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[63] =
      Triangle(vec3(-0.445312, 0.335938, -0.12802), vec3(-0.476562, 0.242188, -0.120208), vec3(-0.351562, 0.242188, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[64] =
      Triangle(vec3(0.164062, -0.929688, 0.020417), vec3(0.0, -0.984375, 0.075105), vec3(0.179688, -0.96875, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[65] =
      Triangle(vec3(-0.164062, -0.929688, 0.020417), vec3(0.0, -0.984375, 0.075105), vec3(0.0, -0.945312, 0.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[66] =
      Triangle(vec3(0.234375, -0.914062, 0.020417), vec3(0.179688, -0.96875, 0.098542), vec3(0.328125, -0.945312, 0.129792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[67] =
      Triangle(vec3(-0.234375, -0.914062, 0.020417), vec3(-0.179688, -0.96875, 0.098542), vec3(-0.164062, -0.929688, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[68] =
      Triangle(vec3(0.367188, -0.890625, 0.12198), vec3(0.234375, -0.914062, 0.020417), vec3(0.328125, -0.945312, 0.129792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[69] =
      Triangle(vec3(-0.234375, -0.914062, 0.020417), vec3(-0.367188, -0.890625, 0.12198), vec3(-0.328125, -0.945312, 0.129792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[70] =
      Triangle(vec3(0.351562, -0.695312, 0.082917), vec3(0.265625, -0.820312, -0.010833), vec3(0.367188, -0.890625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[71] =
      Triangle(vec3(-0.265625, -0.820312, -0.010833), vec3(-0.351562, -0.695312, 0.082917), vec3(-0.367188, -0.890625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[72] =
      Triangle(vec3(0.3125, -0.4375, 0.082917), vec3(0.25, -0.703125, -0.03427), vec3(0.351562, -0.695312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[73] =
      Triangle(vec3(-0.25, -0.703125, -0.03427), vec3(-0.3125, -0.4375, 0.082917), vec3(-0.351562, -0.695312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[74] =
      Triangle(vec3(0.203125, -0.1875, 0.09073), vec3(0.398438, -0.046875, -0.018645), vec3(0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[75] =
      Triangle(vec3(-0.398438, -0.046875, -0.018645), vec3(-0.203125, -0.1875, 0.09073), vec3(-0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[76] =
      Triangle(vec3(0.632812, -0.039062, 0.114167), vec3(0.398438, -0.046875, -0.018645), vec3(0.4375, -0.140625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[77] =
      Triangle(vec3(-0.632812, -0.039062, 0.114167), vec3(-0.398438, -0.046875, -0.018645), vec3(-0.617188, 0.054688, 0.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[78] =
      Triangle(vec3(0.632812, -0.039062, 0.114167), vec3(0.726562, 0.203125, 0.051667), vec3(0.617188, 0.054688, 0.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[79] =
      Triangle(vec3(-0.726562, 0.203125, 0.051667), vec3(-0.632812, -0.039062, 0.114167), vec3(-0.617188, 0.054688, 0.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[80] =
      Triangle(vec3(0.859375, 0.429688, 0.05948), vec3(0.726562, 0.203125, 0.051667), vec3(0.828125, 0.148438, 0.207917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[81] =
      Triangle(vec3(-0.859375, 0.429688, 0.05948), vec3(-0.726562, 0.203125, 0.051667), vec3(-0.742188, 0.375, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[82] =
      Triangle(vec3(0.710938, 0.484375, 0.02823), vec3(0.742188, 0.375, -0.00302), vec3(0.859375, 0.429688, 0.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[83] =
      Triangle(vec3(-0.710938, 0.484375, 0.02823), vec3(-0.742188, 0.375, -0.00302), vec3(-0.6875, 0.414062, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[84] =
      Triangle(vec3(0.492188, 0.601562, -0.03427), vec3(0.6875, 0.414062, -0.073333), vec3(0.710938, 0.484375, 0.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[85] =
      Triangle(vec3(-0.492188, 0.601562, -0.03427), vec3(-0.6875, 0.414062, -0.073333), vec3(-0.4375, 0.546875, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[86] =
      Triangle(vec3(0.492188, 0.601562, -0.03427), vec3(0.3125, 0.640625, -0.182708), vec3(0.4375, 0.546875, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[87] =
      Triangle(vec3(-0.3125, 0.640625, -0.182708), vec3(-0.492188, 0.601562, -0.03427), vec3(-0.4375, 0.546875, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[88] =
      Triangle(vec3(0.15625, 0.71875, -0.104583), vec3(0.3125, 0.640625, -0.182708), vec3(0.320312, 0.757812, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[89] =
      Triangle(vec3(-0.15625, 0.71875, -0.104583), vec3(-0.3125, 0.640625, -0.182708), vec3(-0.203125, 0.617188, -0.198333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[90] =
      Triangle(vec3(0.0625, 0.492188, -0.09677), vec3(0.203125, 0.617188, -0.198333), vec3(0.15625, 0.71875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[91] =
      Triangle(vec3(-0.0625, 0.492188, -0.09677), vec3(-0.203125, 0.617188, -0.198333), vec3(-0.101562, 0.429688, -0.19052),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[92] =
      Triangle(vec3(0.0, 0.429688, -0.088958), vec3(0.101562, 0.429688, -0.19052), vec3(0.0625, 0.492188, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[93] =
      Triangle(vec3(0.0, 0.429688, -0.088958), vec3(-0.101562, 0.429688, -0.19052), vec3(0.0, 0.351562, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[94] =
      Triangle(vec3(0.25, 0.46875, -0.104583), vec3(0.101562, 0.429688, -0.19052), vec3(0.164062, 0.414062, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[95] =
      Triangle(vec3(-0.25, 0.46875, -0.104583), vec3(-0.101562, 0.429688, -0.19052), vec3(-0.203125, 0.617188, -0.198333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[96] =
      Triangle(vec3(0.25, 0.46875, -0.104583), vec3(0.3125, 0.640625, -0.182708), vec3(0.203125, 0.617188, -0.198333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[97] =
      Triangle(vec3(-0.3125, 0.640625, -0.182708), vec3(-0.25, 0.46875, -0.104583), vec3(-0.203125, 0.617188, -0.198333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[98] =
      Triangle(vec3(0.4375, 0.546875, -0.143645), vec3(0.328125, 0.476562, -0.088958), vec3(0.429688, 0.4375, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[99] =
      Triangle(vec3(-0.4375, 0.546875, -0.143645), vec3(-0.328125, 0.476562, -0.088958), vec3(-0.3125, 0.640625, -0.182708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[100] =
      Triangle(vec3(0.6875, 0.414062, -0.073333), vec3(0.429688, 0.4375, -0.06552), vec3(0.601562, 0.375, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[101] =
      Triangle(vec3(-0.6875, 0.414062, -0.073333), vec3(-0.429688, 0.4375, -0.06552), vec3(-0.4375, 0.546875, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[102] =
      Triangle(vec3(0.742188, 0.375, -0.00302), vec3(0.601562, 0.375, -0.010833), vec3(0.640625, 0.296875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[103] =
      Triangle(vec3(-0.742188, 0.375, -0.00302), vec3(-0.601562, 0.375, -0.010833), vec3(-0.6875, 0.414062, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[104] =
      Triangle(vec3(0.726562, 0.203125, 0.051667), vec3(0.640625, 0.296875, 0.004792), vec3(0.625, 0.1875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[105] =
      Triangle(vec3(-0.726562, 0.203125, 0.051667), vec3(-0.640625, 0.296875, 0.004792), vec3(-0.742188, 0.375, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[106] =
      Triangle(vec3(0.617188, 0.054688, 0.02823), vec3(0.625, 0.1875, 0.004792), vec3(0.492188, 0.0625, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[107] =
      Triangle(vec3(-0.617188, 0.054688, 0.02823), vec3(-0.625, 0.1875, 0.004792), vec3(-0.726562, 0.203125, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[108] =
      Triangle(vec3(0.398438, -0.046875, -0.018645), vec3(0.492188, 0.0625, -0.018645), vec3(0.375, 0.015625, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[109] =
      Triangle(vec3(-0.398438, -0.046875, -0.018645), vec3(-0.492188, 0.0625, -0.018645), vec3(-0.617188, 0.054688, 0.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[110] =
      Triangle(vec3(0.125, -0.101562, -0.15927), vec3(0.375, 0.015625, -0.049895), vec3(0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[111] =
      Triangle(vec3(-0.125, -0.101562, -0.15927), vec3(-0.375, 0.015625, -0.049895), vec3(-0.398438, -0.046875, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[112] =
      Triangle(vec3(0.203125, 0.09375, -0.088958), vec3(0.0, 0.046875, -0.073333), vec3(0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[113] =
      Triangle(vec3(0.0, 0.046875, -0.073333), vec3(-0.203125, 0.09375, -0.088958), vec3(-0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[114] =
      Triangle(vec3(0.101562, 0.429688, -0.19052), vec3(0.125, 0.304688, -0.112395), vec3(0.164062, 0.414062, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[115] =
      Triangle(vec3(-0.101562, 0.429688, -0.19052), vec3(-0.125, 0.304688, -0.112395), vec3(0.0, 0.351562, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[116] =
      Triangle(vec3(0.125, 0.304688, -0.112395), vec3(0.0, 0.210938, -0.112395), vec3(0.132812, 0.210938, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[117] =
      Triangle(vec3(0.0, 0.210938, -0.112395), vec3(-0.125, 0.304688, -0.112395), vec3(-0.132812, 0.210938, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[118] =
      Triangle(vec3(0.164062, 0.140625, -0.09677), vec3(0.0, 0.210938, -0.112395), vec3(0.0, 0.046875, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[119] =
      Triangle(vec3(-0.164062, 0.140625, -0.09677), vec3(0.0, 0.210938, -0.112395), vec3(-0.132812, 0.210938, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[120] =
      Triangle(vec3(0.0625, -0.882812, -0.042083), vec3(0.0, -0.945312, 0.012605), vec3(0.164062, -0.929688, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[121] =
      Triangle(vec3(0.0, -0.945312, 0.012605), vec3(-0.0625, -0.882812, -0.042083), vec3(-0.164062, -0.929688, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[122] =
      Triangle(vec3(0.117188, -0.835938, -0.057708), vec3(0.164062, -0.929688, 0.020417), vec3(0.234375, -0.914062, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[123] =
      Triangle(vec3(-0.164062, -0.929688, 0.020417), vec3(-0.117188, -0.835938, -0.057708), vec3(-0.234375, -0.914062, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[124] =
      Triangle(vec3(0.117188, -0.835938, -0.057708), vec3(0.265625, -0.820312, -0.010833), vec3(0.109375, -0.71875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[125] =
      Triangle(vec3(-0.117188, -0.835938, -0.057708), vec3(-0.265625, -0.820312, -0.010833), vec3(-0.234375, -0.914062, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[126] =
      Triangle(vec3(0.210938, -0.445312, -0.057708), vec3(0.117188, -0.6875, -0.081145), vec3(0.25, -0.703125, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[127] =
      Triangle(vec3(-0.117188, -0.6875, -0.081145), vec3(-0.210938, -0.445312, -0.057708), vec3(-0.25, -0.703125, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[128] =
      Triangle(vec3(0.109375, -0.71875, -0.081145), vec3(0.25, -0.703125, -0.03427), vec3(0.117188, -0.6875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[129] =
      Triangle(vec3(-0.25, -0.703125, -0.03427), vec3(-0.109375, -0.71875, -0.081145), vec3(-0.117188, -0.6875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[130] =
      Triangle(vec3(0.0, -0.328125, -0.088958), vec3(0.078125, -0.445312, -0.09677), vec3(0.085938, -0.289062, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[131] =
      Triangle(vec3(0.0, -0.328125, -0.088958), vec3(-0.078125, -0.445312, -0.09677), vec3(0.0, -0.445312, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[132] =
      Triangle(vec3(0.078125, -0.445312, -0.09677), vec3(0.0, -0.679688, -0.081145), vec3(0.117188, -0.6875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[133] =
      Triangle(vec3(-0.078125, -0.445312, -0.09677), vec3(0.0, -0.679688, -0.081145), vec3(0.0, -0.445312, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[134] =
      Triangle(vec3(0.109375, -0.71875, -0.081145), vec3(0.0, -0.679688, -0.081145), vec3(0.0, -0.765625, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[135] =
      Triangle(vec3(-0.109375, -0.71875, -0.081145), vec3(0.0, -0.679688, -0.081145), vec3(-0.117188, -0.6875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[136] =
      Triangle(vec3(0.125, -0.226562, -0.09677), vec3(0.09375, -0.273438, -0.12802), vec3(0.085938, -0.289062, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[137] =
      Triangle(vec3(-0.09375, -0.273438, -0.12802), vec3(-0.125, -0.226562, -0.09677), vec3(-0.085938, -0.289062, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[138] =
      Triangle(vec3(0.101562, -0.148438, -0.088958), vec3(0.132812, -0.226562, -0.143645), vec3(0.125, -0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[139] =
      Triangle(vec3(-0.132812, -0.226562, -0.143645), vec3(-0.101562, -0.148438, -0.088958), vec3(-0.125, -0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[140] =
      Triangle(vec3(0.039062, -0.125, -0.12802), vec3(0.101562, -0.148438, -0.088958), vec3(0.0, -0.140625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[141] =
      Triangle(vec3(-0.039062, -0.125, -0.12802), vec3(-0.101562, -0.148438, -0.088958), vec3(-0.109375, -0.132812, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[142] =
      Triangle(vec3(0.0, -0.1875, -0.143645), vec3(0.0, -0.140625, -0.088958), vec3(0.0, -0.195312, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[143] =
      Triangle(vec3(0.0, -0.1875, -0.143645), vec3(0.0, -0.140625, -0.088958), vec3(-0.039062, -0.125, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[144] =
      Triangle(vec3(0.085938, -0.289062, -0.088958), vec3(0.0, -0.320312, -0.12802), vec3(0.0, -0.328125, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[145] =
      Triangle(vec3(-0.085938, -0.289062, -0.088958), vec3(0.0, -0.320312, -0.12802), vec3(-0.09375, -0.273438, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[146] =
      Triangle(vec3(0.09375, -0.273438, -0.12802), vec3(0.0, -0.289062, -0.151458), vec3(0.0, -0.320312, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[147] =
      Triangle(vec3(-0.09375, -0.273438, -0.12802), vec3(0.0, -0.289062, -0.151458), vec3(-0.078125, -0.25, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[148] =
      Triangle(vec3(0.0, -0.1875, -0.143645), vec3(0.046875, -0.148438, -0.15927), vec3(0.039062, -0.125, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[149] =
      Triangle(vec3(-0.046875, -0.148438, -0.15927), vec3(0.0, -0.1875, -0.143645), vec3(-0.039062, -0.125, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[150] =
      Triangle(vec3(0.039062, -0.125, -0.12802), vec3(0.09375, -0.15625, -0.15927), vec3(0.109375, -0.132812, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[151] =
      Triangle(vec3(-0.09375, -0.15625, -0.15927), vec3(-0.039062, -0.125, -0.12802), vec3(-0.109375, -0.132812, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[152] =
      Triangle(vec3(0.09375, -0.15625, -0.15927), vec3(0.132812, -0.226562, -0.143645), vec3(0.109375, -0.132812, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[153] =
      Triangle(vec3(-0.09375, -0.15625, -0.15927), vec3(-0.132812, -0.226562, -0.143645), vec3(-0.109375, -0.226562, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[154] =
      Triangle(vec3(0.132812, -0.226562, -0.143645), vec3(0.078125, -0.25, -0.151458), vec3(0.09375, -0.273438, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[155] =
      Triangle(vec3(-0.078125, -0.25, -0.151458), vec3(-0.132812, -0.226562, -0.143645), vec3(-0.09375, -0.273438, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[156] =
      Triangle(vec3(0.109375, -0.226562, -0.174895), vec3(0.046875, -0.148438, -0.15927), vec3(0.0, -0.203125, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[157] =
      Triangle(vec3(-0.109375, -0.226562, -0.174895), vec3(-0.046875, -0.148438, -0.15927), vec3(-0.09375, -0.15625, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[158] =
      Triangle(vec3(0.0, -0.203125, -0.174895), vec3(0.078125, -0.25, -0.151458), vec3(0.109375, -0.226562, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[159] =
      Triangle(vec3(-0.078125, -0.25, -0.151458), vec3(0.0, -0.203125, -0.174895), vec3(-0.109375, -0.226562, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[160] =
      Triangle(vec3(0.0, -0.140625, -0.088958), vec3(0.125, -0.101562, -0.15927), vec3(0.0, 0.046875, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[161] =
      Triangle(vec3(-0.125, -0.101562, -0.15927), vec3(0.0, -0.140625, -0.088958), vec3(0.0, 0.046875, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[162] =
      Triangle(vec3(0.101562, -0.148438, -0.088958), vec3(0.164062, -0.242188, -0.057708), vec3(0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[163] =
      Triangle(vec3(-0.164062, -0.242188, -0.057708), vec3(-0.101562, -0.148438, -0.088958), vec3(-0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[164] =
      Triangle(vec3(0.085938, -0.289062, -0.088958), vec3(0.164062, -0.242188, -0.057708), vec3(0.125, -0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[165] =
      Triangle(vec3(-0.085938, -0.289062, -0.088958), vec3(-0.164062, -0.242188, -0.057708), vec3(-0.179688, -0.3125, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[166] =
      Triangle(vec3(0.078125, -0.445312, -0.09677), vec3(0.179688, -0.3125, -0.057708), vec3(0.085938, -0.289062, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[167] =
      Triangle(vec3(-0.078125, -0.445312, -0.09677), vec3(-0.179688, -0.3125, -0.057708), vec3(-0.210938, -0.445312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[168] =
      Triangle(vec3(0.257812, -0.3125, 0.098542), vec3(0.210938, -0.445312, -0.057708), vec3(0.3125, -0.4375, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[169] =
      Triangle(vec3(-0.257812, -0.3125, 0.098542), vec3(-0.210938, -0.445312, -0.057708), vec3(-0.179688, -0.3125, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[170] =
      Triangle(vec3(0.234375, -0.25, 0.098542), vec3(0.179688, -0.3125, -0.057708), vec3(0.257812, -0.3125, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[171] =
      Triangle(vec3(-0.234375, -0.25, 0.098542), vec3(-0.179688, -0.3125, -0.057708), vec3(-0.164062, -0.242188, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[172] =
      Triangle(vec3(0.203125, -0.1875, 0.09073), vec3(0.164062, -0.242188, -0.057708), vec3(0.234375, -0.25, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[173] =
      Triangle(vec3(-0.164062, -0.242188, -0.057708), vec3(-0.203125, -0.1875, 0.09073), vec3(-0.234375, -0.25, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[174] =
      Triangle(vec3(0.0, -0.765625, -0.081145), vec3(0.09375, -0.742188, -0.073333), vec3(0.109375, -0.71875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[175] =
      Triangle(vec3(0.0, -0.765625, -0.081145), vec3(-0.09375, -0.742188, -0.073333), vec3(0.0, -0.773438, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[176] =
      Triangle(vec3(0.117188, -0.835938, -0.057708), vec3(0.09375, -0.742188, -0.073333), vec3(0.09375, -0.820312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[177] =
      Triangle(vec3(-0.09375, -0.742188, -0.073333), vec3(-0.117188, -0.835938, -0.057708), vec3(-0.09375, -0.820312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[178] =
      Triangle(vec3(0.0625, -0.882812, -0.042083), vec3(0.09375, -0.820312, -0.057708), vec3(0.046875, -0.867188, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[179] =
      Triangle(vec3(-0.09375, -0.820312, -0.057708), vec3(-0.0625, -0.882812, -0.042083), vec3(-0.046875, -0.867188, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[180] =
      Triangle(vec3(0.0, -0.890625, -0.03427), vec3(0.046875, -0.867188, -0.03427), vec3(0.0, -0.875, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[181] =
      Triangle(vec3(-0.046875, -0.867188, -0.03427), vec3(0.0, -0.890625, -0.03427), vec3(0.0, -0.875, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[182] =
      Triangle(vec3(0.046875, -0.867188, -0.03427), vec3(0.0, -0.859375, 0.020417), vec3(0.0, -0.875, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[183] =
      Triangle(vec3(-0.046875, -0.867188, -0.03427), vec3(0.0, -0.859375, 0.020417), vec3(-0.046875, -0.851562, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[184] =
      Triangle(vec3(0.046875, -0.867188, -0.03427), vec3(0.09375, -0.8125, 0.012605), vec3(0.046875, -0.851562, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[185] =
      Triangle(vec3(-0.09375, -0.8125, 0.012605), vec3(-0.046875, -0.867188, -0.03427), vec3(-0.046875, -0.851562, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[186] =
      Triangle(vec3(0.09375, -0.820312, -0.057708), vec3(0.09375, -0.75, -0.010833), vec3(0.09375, -0.8125, 0.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[187] =
      Triangle(vec3(-0.09375, -0.75, -0.010833), vec3(-0.09375, -0.820312, -0.057708), vec3(-0.09375, -0.8125, 0.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[188] =
      Triangle(vec3(0.0, -0.773438, -0.06552), vec3(0.09375, -0.75, -0.010833), vec3(0.09375, -0.742188, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[189] =
      Triangle(vec3(0.0, -0.773438, -0.06552), vec3(-0.09375, -0.75, -0.010833), vec3(0.0, -0.78125, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[190] =
      Triangle(vec3(0.0, -0.78125, -0.00302), vec3(0.046875, -0.851562, 0.020417), vec3(0.09375, -0.75, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[191] =
      Triangle(vec3(-0.046875, -0.851562, 0.020417), vec3(0.0, -0.78125, -0.00302), vec3(-0.09375, -0.75, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[192] =
      Triangle(vec3(0.09375, -0.75, -0.010833), vec3(0.046875, -0.851562, 0.020417), vec3(0.09375, -0.8125, 0.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[193] =
      Triangle(vec3(-0.09375, -0.8125, 0.012605), vec3(-0.046875, -0.851562, 0.020417), vec3(-0.09375, -0.75, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[194] =
      Triangle(vec3(0.132812, 0.210938, -0.104583), vec3(0.1875, 0.15625, -0.120208), vec3(0.171875, 0.21875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[195] =
      Triangle(vec3(-0.1875, 0.15625, -0.120208), vec3(-0.132812, 0.210938, -0.104583), vec3(-0.171875, 0.21875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[196] =
      Triangle(vec3(0.125, 0.304688, -0.112395), vec3(0.171875, 0.21875, -0.12802), vec3(0.179688, 0.296875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[197] =
      Triangle(vec3(-0.171875, 0.21875, -0.12802), vec3(-0.125, 0.304688, -0.112395), vec3(-0.179688, 0.296875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[198] =
      Triangle(vec3(0.125, 0.304688, -0.112395), vec3(0.210938, 0.375, -0.12802), vec3(0.164062, 0.414062, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[199] =
      Triangle(vec3(-0.125, 0.304688, -0.112395), vec3(-0.210938, 0.375, -0.12802), vec3(-0.179688, 0.296875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[200] =
      Triangle(vec3(0.203125, 0.09375, -0.088958), vec3(0.1875, 0.15625, -0.120208), vec3(0.164062, 0.140625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[201] =
      Triangle(vec3(-0.203125, 0.09375, -0.088958), vec3(-0.1875, 0.15625, -0.120208), vec3(-0.226562, 0.109375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[202] =
      Triangle(vec3(0.203125, 0.09375, -0.088958), vec3(0.375, 0.0625, -0.088958), vec3(0.226562, 0.109375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[203] =
      Triangle(vec3(-0.375, 0.0625, -0.088958), vec3(-0.203125, 0.09375, -0.088958), vec3(-0.226562, 0.109375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[204] =
      Triangle(vec3(0.375, 0.015625, -0.049895), vec3(0.476562, 0.101562, -0.06552), vec3(0.375, 0.0625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[205] =
      Triangle(vec3(-0.476562, 0.101562, -0.06552), vec3(-0.375, 0.015625, -0.049895), vec3(-0.375, 0.0625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[206] =
      Triangle(vec3(0.492188, 0.0625, -0.018645), vec3(0.578125, 0.195312, -0.026458), vec3(0.476562, 0.101562, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[207] =
      Triangle(vec3(-0.578125, 0.195312, -0.026458), vec3(-0.492188, 0.0625, -0.018645), vec3(-0.476562, 0.101562, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[208] =
      Triangle(vec3(0.625, 0.1875, 0.004792), vec3(0.585938, 0.289062, -0.03427), vec3(0.578125, 0.195312, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[209] =
      Triangle(vec3(-0.585938, 0.289062, -0.03427), vec3(-0.625, 0.1875, 0.004792), vec3(-0.578125, 0.195312, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[210] =
      Triangle(vec3(0.601562, 0.375, -0.010833), vec3(0.585938, 0.289062, -0.03427), vec3(0.640625, 0.296875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[211] =
      Triangle(vec3(-0.601562, 0.375, -0.010833), vec3(-0.585938, 0.289062, -0.03427), vec3(-0.5625, 0.351562, -0.042083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[212] =
      Triangle(vec3(0.429688, 0.4375, -0.06552), vec3(0.5625, 0.351562, -0.042083), vec3(0.601562, 0.375, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[213] =
      Triangle(vec3(-0.429688, 0.4375, -0.06552), vec3(-0.5625, 0.351562, -0.042083), vec3(-0.421875, 0.398438, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[214] =
      Triangle(vec3(0.429688, 0.4375, -0.06552), vec3(0.335938, 0.429688, -0.104583), vec3(0.421875, 0.398438, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[215] =
      Triangle(vec3(-0.335938, 0.429688, -0.104583), vec3(-0.429688, 0.4375, -0.06552), vec3(-0.421875, 0.398438, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[216] =
      Triangle(vec3(0.328125, 0.476562, -0.088958), vec3(0.273438, 0.421875, -0.120208), vec3(0.335938, 0.429688, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[217] =
      Triangle(vec3(-0.273438, 0.421875, -0.120208), vec3(-0.328125, 0.476562, -0.088958), vec3(-0.335938, 0.429688, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[218] =
      Triangle(vec3(0.25, 0.46875, -0.104583), vec3(0.210938, 0.375, -0.12802), vec3(0.273438, 0.421875, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[219] =
      Triangle(vec3(-0.210938, 0.375, -0.12802), vec3(-0.25, 0.46875, -0.104583), vec3(-0.273438, 0.421875, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[220] =
      Triangle(vec3(0.210938, 0.375, -0.12802), vec3(0.28125, 0.398438, -0.112395), vec3(0.273438, 0.421875, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[221] =
      Triangle(vec3(-0.210938, 0.375, -0.12802), vec3(-0.28125, 0.398438, -0.112395), vec3(-0.234375, 0.359375, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[222] =
      Triangle(vec3(0.335938, 0.429688, -0.104583), vec3(0.28125, 0.398438, -0.112395), vec3(0.335938, 0.40625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[223] =
      Triangle(vec3(-0.28125, 0.398438, -0.112395), vec3(-0.335938, 0.429688, -0.104583), vec3(-0.335938, 0.40625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[224] =
      Triangle(vec3(0.335938, 0.429688, -0.104583), vec3(0.414062, 0.390625, -0.09677), vec3(0.421875, 0.398438, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[225] =
      Triangle(vec3(-0.335938, 0.429688, -0.104583), vec3(-0.414062, 0.390625, -0.09677), vec3(-0.335938, 0.40625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[226] =
      Triangle(vec3(0.421875, 0.398438, -0.120208), vec3(0.53125, 0.335938, -0.026458), vec3(0.5625, 0.351562, -0.042083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[227] =
      Triangle(vec3(-0.421875, 0.398438, -0.120208), vec3(-0.53125, 0.335938, -0.026458), vec3(-0.414062, 0.390625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[228] =
      Triangle(vec3(0.585938, 0.289062, -0.03427), vec3(0.53125, 0.335938, -0.026458), vec3(0.554688, 0.28125, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[229] =
      Triangle(vec3(-0.53125, 0.335938, -0.026458), vec3(-0.585938, 0.289062, -0.03427), vec3(-0.554688, 0.28125, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[230] =
      Triangle(vec3(0.585938, 0.289062, -0.03427), vec3(0.546875, 0.210938, -0.018645), vec3(0.578125, 0.195312, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[231] =
      Triangle(vec3(-0.585938, 0.289062, -0.03427), vec3(-0.546875, 0.210938, -0.018645), vec3(-0.554688, 0.28125, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[232] =
      Triangle(vec3(0.476562, 0.101562, -0.06552), vec3(0.546875, 0.210938, -0.018645), vec3(0.460938, 0.117188, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[233] =
      Triangle(vec3(-0.546875, 0.210938, -0.018645), vec3(-0.476562, 0.101562, -0.06552), vec3(-0.460938, 0.117188, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[234] =
      Triangle(vec3(0.476562, 0.101562, -0.06552), vec3(0.375, 0.085938, -0.073333), vec3(0.375, 0.0625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[235] =
      Triangle(vec3(-0.476562, 0.101562, -0.06552), vec3(-0.375, 0.085938, -0.073333), vec3(-0.460938, 0.117188, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[236] =
      Triangle(vec3(0.375, 0.0625, -0.088958), vec3(0.242188, 0.125, -0.104583), vec3(0.226562, 0.109375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[237] =
      Triangle(vec3(-0.375, 0.0625, -0.088958), vec3(-0.242188, 0.125, -0.104583), vec3(-0.375, 0.085938, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[238] =
      Triangle(vec3(0.1875, 0.15625, -0.120208), vec3(0.242188, 0.125, -0.104583), vec3(0.203125, 0.171875, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[239] =
      Triangle(vec3(-0.242188, 0.125, -0.104583), vec3(-0.1875, 0.15625, -0.120208), vec3(-0.203125, 0.171875, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[240] =
      Triangle(vec3(0.210938, 0.375, -0.12802), vec3(0.195312, 0.296875, -0.104583), vec3(0.234375, 0.359375, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[241] =
      Triangle(vec3(-0.195312, 0.296875, -0.104583), vec3(-0.210938, 0.375, -0.12802), vec3(-0.234375, 0.359375, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[242] =
      Triangle(vec3(0.179688, 0.296875, -0.12802), vec3(0.195312, 0.226562, -0.09677), vec3(0.195312, 0.296875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[243] =
      Triangle(vec3(-0.195312, 0.226562, -0.09677), vec3(-0.179688, 0.296875, -0.12802), vec3(-0.195312, 0.296875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[244] =
      Triangle(vec3(0.171875, 0.21875, -0.12802), vec3(0.203125, 0.171875, -0.09677), vec3(0.195312, 0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[245] =
      Triangle(vec3(-0.203125, 0.171875, -0.09677), vec3(-0.171875, 0.21875, -0.12802), vec3(-0.195312, 0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[246] =
      Triangle(vec3(0.0, 0.429688, -0.088958), vec3(0.109375, 0.460938, 0.043855), vec3(0.0, 0.40625, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[247] =
      Triangle(vec3(-0.109375, 0.460938, 0.043855), vec3(0.0, 0.429688, -0.088958), vec3(0.0, 0.40625, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[248] =
      Triangle(vec3(0.0625, 0.492188, -0.09677), vec3(0.195312, 0.664062, 0.036042), vec3(0.109375, 0.460938, 0.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[249] =
      Triangle(vec3(-0.195312, 0.664062, 0.036042), vec3(-0.0625, 0.492188, -0.09677), vec3(-0.109375, 0.460938, 0.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[250] =
      Triangle(vec3(0.320312, 0.757812, -0.081145), vec3(0.195312, 0.664062, 0.036042), vec3(0.15625, 0.71875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[251] =
      Triangle(vec3(-0.320312, 0.757812, -0.081145), vec3(-0.195312, 0.664062, 0.036042), vec3(-0.335938, 0.6875, 0.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[252] =
      Triangle(vec3(0.492188, 0.601562, -0.03427), vec3(0.335938, 0.6875, 0.05948), vec3(0.320312, 0.757812, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[253] =
      Triangle(vec3(-0.492188, 0.601562, -0.03427), vec3(-0.335938, 0.6875, 0.05948), vec3(-0.484375, 0.554688, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[254] =
      Triangle(vec3(0.710938, 0.484375, 0.02823), vec3(0.484375, 0.554688, 0.098542), vec3(0.492188, 0.601562, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[255] =
      Triangle(vec3(-0.710938, 0.484375, 0.02823), vec3(-0.484375, 0.554688, 0.098542), vec3(-0.679688, 0.453125, 0.161042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[256] =
      Triangle(vec3(0.710938, 0.484375, 0.02823), vec3(0.796875, 0.40625, 0.192292), vec3(0.679688, 0.453125, 0.161042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[257] =
      Triangle(vec3(-0.796875, 0.40625, 0.192292), vec3(-0.710938, 0.484375, 0.02823), vec3(-0.679688, 0.453125, 0.161042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[258] =
      Triangle(vec3(0.828125, 0.148438, 0.207917), vec3(0.796875, 0.40625, 0.192292), vec3(0.859375, 0.429688, 0.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[259] =
      Triangle(vec3(-0.828125, 0.148438, 0.207917), vec3(-0.796875, 0.40625, 0.192292), vec3(-0.773438, 0.164062, 0.27823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[260] =
      Triangle(vec3(0.828125, 0.148438, 0.207917), vec3(0.601562, 0.0, 0.239167), vec3(0.773438, 0.164062, 0.27823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[261] =
      Triangle(vec3(-0.601562, 0.0, 0.239167), vec3(-0.828125, 0.148438, 0.207917), vec3(-0.773438, 0.164062, 0.27823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[262] =
      Triangle(vec3(0.632812, -0.039062, 0.114167), vec3(0.4375, -0.09375, 0.18448), vec3(0.601562, 0.0, 0.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[263] =
      Triangle(vec3(-0.4375, -0.09375, 0.18448), vec3(-0.632812, -0.039062, 0.114167), vec3(-0.601562, 0.0, 0.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[264] =
      Triangle(vec3(0.0, -0.484375, 0.37198), vec3(0.125, -0.539062, 0.293855), vec3(0.0, -0.570312, 0.332917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[265] =
      Triangle(vec3(0.0, -0.484375, 0.37198), vec3(-0.125, -0.539062, 0.293855), vec3(-0.179688, -0.414062, 0.395417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[266] =
      Triangle(vec3(0.0, -0.570312, 0.332917), vec3(0.140625, -0.757812, 0.286042), vec3(0.0, -0.804688, 0.30948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[267] =
      Triangle(vec3(0.0, -0.570312, 0.332917), vec3(-0.140625, -0.757812, 0.286042), vec3(-0.125, -0.539062, 0.293855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[268] =
      Triangle(vec3(0.0, -0.804688, 0.30948), vec3(0.164062, -0.945312, 0.21573), vec3(0.0, -0.976562, 0.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[269] =
      Triangle(vec3(0.0, -0.804688, 0.30948), vec3(-0.164062, -0.945312, 0.21573), vec3(-0.140625, -0.757812, 0.286042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[270] =
      Triangle(vec3(0.179688, -0.96875, 0.098542), vec3(0.0, -0.976562, 0.192292), vec3(0.164062, -0.945312, 0.21573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[271] =
      Triangle(vec3(0.0, -0.976562, 0.192292), vec3(-0.179688, -0.96875, 0.098542), vec3(-0.164062, -0.945312, 0.21573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[272] =
      Triangle(vec3(0.328125, -0.945312, 0.129792), vec3(0.164062, -0.945312, 0.21573), vec3(0.328125, -0.914062, 0.254792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[273] =
      Triangle(vec3(-0.164062, -0.945312, 0.21573), vec3(-0.328125, -0.945312, 0.129792), vec3(-0.328125, -0.914062, 0.254792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[274] =
      Triangle(vec3(0.367188, -0.890625, 0.12198), vec3(0.328125, -0.914062, 0.254792), vec3(0.289062, -0.710938, 0.270417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[275] =
      Triangle(vec3(-0.328125, -0.914062, 0.254792), vec3(-0.367188, -0.890625, 0.12198), vec3(-0.289062, -0.710938, 0.270417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[276] =
      Triangle(vec3(0.351562, -0.695312, 0.082917), vec3(0.289062, -0.710938, 0.270417), vec3(0.25, -0.5, 0.262605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[277] =
      Triangle(vec3(-0.289062, -0.710938, 0.270417), vec3(-0.351562, -0.695312, 0.082917), vec3(-0.25, -0.5, 0.262605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[278] =
      Triangle(vec3(0.289062, -0.710938, 0.270417), vec3(0.125, -0.539062, 0.293855), vec3(0.25, -0.5, 0.262605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[279] =
      Triangle(vec3(-0.125, -0.539062, 0.293855), vec3(-0.289062, -0.710938, 0.270417), vec3(-0.25, -0.5, 0.262605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[280] =
      Triangle(vec3(0.328125, -0.914062, 0.254792), vec3(0.140625, -0.757812, 0.286042), vec3(0.289062, -0.710938, 0.270417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[281] =
      Triangle(vec3(-0.328125, -0.914062, 0.254792), vec3(-0.140625, -0.757812, 0.286042), vec3(-0.164062, -0.945312, 0.21573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[282] =
      Triangle(vec3(0.25, -0.5, 0.262605), vec3(0.179688, -0.414062, 0.395417), vec3(0.234375, -0.351562, 0.24698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[283] =
      Triangle(vec3(-0.25, -0.5, 0.262605), vec3(-0.179688, -0.414062, 0.395417), vec3(-0.125, -0.539062, 0.293855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[284] =
      Triangle(vec3(0.3125, -0.4375, 0.082917), vec3(0.25, -0.5, 0.262605), vec3(0.234375, -0.351562, 0.24698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[285] =
      Triangle(vec3(-0.25, -0.5, 0.262605), vec3(-0.3125, -0.4375, 0.082917), vec3(-0.234375, -0.351562, 0.24698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[286] =
      Triangle(vec3(0.21875, -0.28125, 0.223542), vec3(0.234375, -0.25, 0.098542), vec3(0.257812, -0.3125, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[287] =
      Triangle(vec3(-0.21875, -0.28125, 0.223542), vec3(-0.234375, -0.25, 0.098542), vec3(-0.210938, -0.226562, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[288] =
      Triangle(vec3(0.234375, -0.351562, 0.24698), vec3(0.257812, -0.3125, 0.098542), vec3(0.3125, -0.4375, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[289] =
      Triangle(vec3(-0.234375, -0.351562, 0.24698), vec3(-0.257812, -0.3125, 0.098542), vec3(-0.21875, -0.28125, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[290] =
      Triangle(vec3(0.234375, -0.25, 0.098542), vec3(0.203125, -0.171875, 0.15323), vec3(0.203125, -0.1875, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[291] =
      Triangle(vec3(-0.234375, -0.25, 0.098542), vec3(-0.203125, -0.171875, 0.15323), vec3(-0.210938, -0.226562, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[292] =
      Triangle(vec3(0.203125, -0.171875, 0.15323), vec3(0.4375, -0.140625, 0.12198), vec3(0.203125, -0.1875, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[293] =
      Triangle(vec3(-0.203125, -0.171875, 0.15323), vec3(-0.4375, -0.140625, 0.12198), vec3(-0.4375, -0.09375, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[294] =
      Triangle(vec3(0.335938, 0.054688, 1.317292), vec3(0.0, -0.195312, 1.325105), vec3(0.0, 0.070312, 1.481355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[295] =
      Triangle(vec3(-0.335938, 0.054688, 1.317292), vec3(0.0, -0.195312, 1.325105), vec3(-0.34375, -0.148438, 1.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[296] =
      Triangle(vec3(0.34375, -0.148438, 1.192292), vec3(0.0, -0.382812, 1.004792), vec3(0.0, -0.195312, 1.325105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[297] =
      Triangle(vec3(-0.34375, -0.148438, 1.192292), vec3(0.0, -0.382812, 1.004792), vec3(-0.296875, -0.3125, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[298] =
      Triangle(vec3(0.0, -0.382812, 1.004792), vec3(0.210938, -0.390625, 0.489167), vec3(0.0, -0.460938, 0.46573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[299] =
      Triangle(vec3(-0.210938, -0.390625, 0.489167), vec3(0.0, -0.382812, 1.004792), vec3(0.0, -0.460938, 0.46573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[300] =
      Triangle(vec3(0.0, -0.460938, 0.46573), vec3(0.179688, -0.414062, 0.395417), vec3(0.0, -0.484375, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[301] =
      Triangle(vec3(-0.179688, -0.414062, 0.395417), vec3(0.0, -0.460938, 0.46573), vec3(0.0, -0.484375, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[302] =
      Triangle(vec3(0.179688, -0.414062, 0.395417), vec3(0.21875, -0.28125, 0.223542), vec3(0.234375, -0.351562, 0.24698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[303] =
      Triangle(vec3(-0.179688, -0.414062, 0.395417), vec3(-0.21875, -0.28125, 0.223542), vec3(-0.210938, -0.390625, 0.489167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[304] =
      Triangle(vec3(0.773438, 0.164062, 0.27823), vec3(0.734375, -0.046875, 0.582917), vec3(0.851562, 0.234375, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[305] =
      Triangle(vec3(-0.734375, -0.046875, 0.582917), vec3(-0.773438, 0.164062, 0.27823), vec3(-0.851562, 0.234375, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[306] =
      Triangle(vec3(0.460938, 0.4375, 1.356355), vec3(0.0, 0.070312, 1.481355), vec3(0.0, 0.5625, 1.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[307] =
      Triangle(vec3(-0.460938, 0.4375, 1.356355), vec3(0.0, 0.070312, 1.481355), vec3(-0.335938, 0.054688, 1.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[308] =
      Triangle(vec3(0.453125, 0.851562, 0.418855), vec3(0.0, 0.984375, 0.731355), vec3(0.0, 0.898438, 0.364167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[309] =
      Triangle(vec3(-0.453125, 0.851562, 0.418855), vec3(0.0, 0.984375, 0.731355), vec3(-0.453125, 0.929688, 0.723542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[310] =
      Triangle(vec3(0.0, 0.984375, 0.731355), vec3(0.453125, 0.867188, 1.036042), vec3(0.0, 0.898438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[311] =
      Triangle(vec3(-0.453125, 0.867188, 1.036042), vec3(0.0, 0.984375, 0.731355), vec3(0.0, 0.898438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[312] =
      Triangle(vec3(0.0, 0.898438, 1.200105), vec3(0.460938, 0.4375, 1.356355), vec3(0.0, 0.5625, 1.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[313] =
      Triangle(vec3(-0.460938, 0.4375, 1.356355), vec3(0.0, 0.898438, 1.200105), vec3(0.0, 0.5625, 1.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[314] =
      Triangle(vec3(0.679688, 0.453125, 0.161042), vec3(0.726562, 0.40625, 0.317292), vec3(0.632812, 0.453125, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[315] =
      Triangle(vec3(-0.726562, 0.40625, 0.317292), vec3(-0.679688, 0.453125, 0.161042), vec3(-0.632812, 0.453125, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[316] =
      Triangle(vec3(0.632812, 0.453125, 0.37198), vec3(0.796875, 0.5625, 0.52823), vec3(0.640625, 0.703125, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[317] =
      Triangle(vec3(-0.796875, 0.5625, 0.52823), vec3(-0.632812, 0.453125, 0.37198), vec3(-0.640625, 0.703125, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[318] =
      Triangle(vec3(0.640625, 0.703125, 0.598542), vec3(0.796875, 0.617188, 0.770417), vec3(0.640625, 0.75, 0.848542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[319] =
      Triangle(vec3(-0.796875, 0.617188, 0.770417), vec3(-0.640625, 0.703125, 0.598542), vec3(-0.640625, 0.75, 0.848542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[320] =
      Triangle(vec3(0.640625, 0.75, 0.848542), vec3(0.796875, 0.539062, 1.012605), vec3(0.640625, 0.679688, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[321] =
      Triangle(vec3(-0.796875, 0.539062, 1.012605), vec3(-0.640625, 0.75, 0.848542), vec3(-0.640625, 0.679688, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[322] =
      Triangle(vec3(0.617188, 0.328125, 1.239167), vec3(0.796875, 0.539062, 1.012605), vec3(0.773438, 0.265625, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[323] =
      Triangle(vec3(-0.617188, 0.328125, 1.239167), vec3(-0.796875, 0.539062, 1.012605), vec3(-0.640625, 0.679688, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[324] =
      Triangle(vec3(0.460938, 0.4375, 1.356355), vec3(0.640625, 0.679688, 1.098542), vec3(0.617188, 0.328125, 1.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[325] =
      Triangle(vec3(-0.640625, 0.679688, 1.098542), vec3(-0.460938, 0.4375, 1.356355), vec3(-0.617188, 0.328125, 1.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[326] =
      Triangle(vec3(0.453125, 0.867188, 1.036042), vec3(0.640625, 0.75, 0.848542), vec3(0.640625, 0.679688, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[327] =
      Triangle(vec3(-0.640625, 0.75, 0.848542), vec3(-0.453125, 0.867188, 1.036042), vec3(-0.640625, 0.679688, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[328] =
      Triangle(vec3(0.453125, 0.929688, 0.723542), vec3(0.640625, 0.703125, 0.598542), vec3(0.640625, 0.75, 0.848542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[329] =
      Triangle(vec3(-0.640625, 0.703125, 0.598542), vec3(-0.453125, 0.929688, 0.723542), vec3(-0.640625, 0.75, 0.848542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[330] =
      Triangle(vec3(0.453125, 0.851562, 0.418855), vec3(0.632812, 0.453125, 0.37198), vec3(0.640625, 0.703125, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[331] =
      Triangle(vec3(-0.632812, 0.453125, 0.37198), vec3(-0.453125, 0.851562, 0.418855), vec3(-0.640625, 0.703125, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[332] =
      Triangle(vec3(0.679688, 0.453125, 0.161042), vec3(0.460938, 0.523438, 0.223542), vec3(0.484375, 0.554688, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[333] =
      Triangle(vec3(-0.679688, 0.453125, 0.161042), vec3(-0.460938, 0.523438, 0.223542), vec3(-0.632812, 0.453125, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[334] =
      Triangle(vec3(0.460938, 0.523438, 0.223542), vec3(0.0, 0.898438, 0.364167), vec3(0.0, 0.570312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[335] =
      Triangle(vec3(-0.460938, 0.523438, 0.223542), vec3(0.0, 0.898438, 0.364167), vec3(-0.453125, 0.851562, 0.418855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[336] =
      Triangle(vec3(0.109375, 0.460938, 0.043855), vec3(0.335938, 0.6875, 0.05948), vec3(0.484375, 0.554688, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[337] =
      Triangle(vec3(-0.335938, 0.6875, 0.05948), vec3(-0.109375, 0.460938, 0.043855), vec3(-0.484375, 0.554688, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[338] =
      Triangle(vec3(0.109375, 0.460938, 0.043855), vec3(0.460938, 0.523438, 0.223542), vec3(0.0, 0.570312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[339] =
      Triangle(vec3(-0.460938, 0.523438, 0.223542), vec3(-0.109375, 0.460938, 0.043855), vec3(0.0, 0.570312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[340] =
      Triangle(vec3(0.0, 0.40625, 0.051667), vec3(0.109375, 0.460938, 0.043855), vec3(0.0, 0.570312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[341] =
      Triangle(vec3(0.0, 0.570312, 0.082917), vec3(-0.109375, 0.460938, 0.043855), vec3(0.0, 0.40625, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[342] =
      Triangle(vec3(0.773438, 0.164062, 0.27823), vec3(0.726562, 0.40625, 0.317292), vec3(0.796875, 0.40625, 0.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[343] =
      Triangle(vec3(-0.773438, 0.164062, 0.27823), vec3(-0.726562, 0.40625, 0.317292), vec3(-0.851562, 0.234375, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[344] =
      Triangle(vec3(0.851562, 0.234375, 0.598542), vec3(0.796875, 0.5625, 0.52823), vec3(0.726562, 0.40625, 0.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[345] =
      Triangle(vec3(-0.796875, 0.5625, 0.52823), vec3(-0.851562, 0.234375, 0.598542), vec3(-0.726562, 0.40625, 0.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[346] =
      Triangle(vec3(0.859375, 0.320312, 0.700105), vec3(0.796875, 0.617188, 0.770417), vec3(0.796875, 0.5625, 0.52823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[347] =
      Triangle(vec3(-0.796875, 0.617188, 0.770417), vec3(-0.859375, 0.320312, 0.700105), vec3(-0.796875, 0.5625, 0.52823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[348] =
      Triangle(vec3(0.796875, 0.539062, 1.012605), vec3(0.820312, 0.328125, 0.856355), vec3(0.773438, 0.265625, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[349] =
      Triangle(vec3(-0.796875, 0.539062, 1.012605), vec3(-0.820312, 0.328125, 0.856355), vec3(-0.796875, 0.617188, 0.770417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[350] =
      Triangle(vec3(0.296875, -0.3125, 0.918855), vec3(0.40625, -0.171875, 0.504792), vec3(0.210938, -0.390625, 0.489167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[351] =
      Triangle(vec3(-0.296875, -0.3125, 0.918855), vec3(-0.40625, -0.171875, 0.504792), vec3(-0.429688, -0.195312, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[352] =
      Triangle(vec3(0.40625, -0.171875, 0.504792), vec3(0.59375, -0.125, 0.817292), vec3(0.734375, -0.046875, 0.582917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[353] =
      Triangle(vec3(-0.40625, -0.171875, 0.504792), vec3(-0.59375, -0.125, 0.817292), vec3(-0.429688, -0.195312, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[354] =
      Triangle(vec3(0.601562, 0.0, 0.239167), vec3(0.40625, -0.171875, 0.504792), vec3(0.734375, -0.046875, 0.582917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[355] =
      Triangle(vec3(-0.40625, -0.171875, 0.504792), vec3(-0.601562, 0.0, 0.239167), vec3(-0.734375, -0.046875, 0.582917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[356] =
      Triangle(vec3(0.4375, -0.09375, 0.18448), vec3(0.21875, -0.28125, 0.223542), vec3(0.40625, -0.171875, 0.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[357] =
      Triangle(vec3(-0.21875, -0.28125, 0.223542), vec3(-0.4375, -0.09375, 0.18448), vec3(-0.40625, -0.171875, 0.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[358] =
      Triangle(vec3(0.21875, -0.28125, 0.223542), vec3(0.210938, -0.390625, 0.489167), vec3(0.40625, -0.171875, 0.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[359] =
      Triangle(vec3(-0.40625, -0.171875, 0.504792), vec3(-0.210938, -0.390625, 0.489167), vec3(-0.21875, -0.28125, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[360] =
      Triangle(vec3(0.4375, -0.09375, 0.18448), vec3(0.203125, -0.171875, 0.15323), vec3(0.210938, -0.226562, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[361] =
      Triangle(vec3(-0.210938, -0.226562, 0.18448), vec3(-0.203125, -0.171875, 0.15323), vec3(-0.4375, -0.09375, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[362] =
      Triangle(vec3(0.640625, -0.007812, 1.082917), vec3(0.617188, 0.328125, 1.239167), vec3(0.773438, 0.265625, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[363] =
      Triangle(vec3(-0.640625, -0.007812, 1.082917), vec3(-0.617188, 0.328125, 1.239167), vec3(-0.484375, 0.023438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[364] =
      Triangle(vec3(0.617188, 0.328125, 1.239167), vec3(0.335938, 0.054688, 1.317292), vec3(0.460938, 0.4375, 1.356355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[365] =
      Triangle(vec3(-0.617188, 0.328125, 1.239167), vec3(-0.335938, 0.054688, 1.317292), vec3(-0.484375, 0.023438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[366] =
      Triangle(vec3(0.429688, -0.195312, 0.864167), vec3(0.640625, -0.007812, 1.082917), vec3(0.59375, -0.125, 0.817292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[367] =
      Triangle(vec3(-0.429688, -0.195312, 0.864167), vec3(-0.640625, -0.007812, 1.082917), vec3(-0.484375, 0.023438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[368] =
      Triangle(vec3(0.34375, -0.148438, 1.192292), vec3(0.429688, -0.195312, 0.864167), vec3(0.296875, -0.3125, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[369] =
      Triangle(vec3(-0.34375, -0.148438, 1.192292), vec3(-0.429688, -0.195312, 0.864167), vec3(-0.484375, 0.023438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[370] =
      Triangle(vec3(0.335938, 0.054688, 1.317292), vec3(0.484375, 0.023438, 1.200105), vec3(0.34375, -0.148438, 1.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[371] =
      Triangle(vec3(-0.34375, -0.148438, 1.192292), vec3(-0.484375, 0.023438, 1.200105), vec3(-0.335938, 0.054688, 1.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[372] =
      Triangle(vec3(0.890625, 0.40625, 0.887605), vec3(1.015625, 0.414062, 0.942292), vec3(1.023438, 0.476562, 0.96573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[373] =
      Triangle(vec3(-0.890625, 0.40625, 0.887605), vec3(-1.015625, 0.414062, 0.942292), vec3(-0.921875, 0.359375, 0.87198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[374] =
      Triangle(vec3(1.023438, 0.476562, 0.96573), vec3(1.1875, 0.4375, 1.043855), vec3(1.234375, 0.507812, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[375] =
      Triangle(vec3(-1.1875, 0.4375, 1.043855), vec3(-1.023438, 0.476562, 0.96573), vec3(-1.234375, 0.507812, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[376] =
      Triangle(vec3(1.1875, 0.4375, 1.043855), vec3(1.351562, 0.320312, 1.075105), vec3(1.234375, 0.507812, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[377] =
      Triangle(vec3(-1.1875, 0.4375, 1.043855), vec3(-1.351562, 0.320312, 1.075105), vec3(-1.265625, 0.289062, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[378] =
      Triangle(vec3(1.265625, 0.289062, 1.05948), vec3(1.28125, 0.054688, 1.082917), vec3(1.351562, 0.320312, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[379] =
      Triangle(vec3(-1.265625, 0.289062, 1.05948), vec3(-1.28125, 0.054688, 1.082917), vec3(-1.210938, 0.078125, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[380] =
      Triangle(vec3(1.210938, 0.078125, 1.05948), vec3(1.039062, -0.101562, 0.981355), vec3(1.28125, 0.054688, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[381] =
      Triangle(vec3(-1.210938, 0.078125, 1.05948), vec3(-1.039062, -0.101562, 0.981355), vec3(-1.03125, -0.039062, 0.957917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[382] =
      Triangle(vec3(1.039062, -0.101562, 0.981355), vec3(0.828125, -0.070312, 0.786042), vec3(0.773438, -0.140625, 0.77823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[383] =
      Triangle(vec3(-0.828125, -0.070312, 0.786042), vec3(-1.039062, -0.101562, 0.981355), vec3(-0.773438, -0.140625, 0.77823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[384] =
      Triangle(vec3(1.03125, -0.039062, 0.957917), vec3(0.882812, -0.023438, 0.864167), vec3(0.828125, -0.070312, 0.786042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[385] =
      Triangle(vec3(-0.882812, -0.023438, 0.864167), vec3(-1.03125, -0.039062, 0.957917), vec3(-0.828125, -0.070312, 0.786042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[386] =
      Triangle(vec3(1.210938, 0.078125, 1.05948), vec3(1.039062, 0.0, 1.020417), vec3(1.03125, -0.039062, 0.957917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[387] =
      Triangle(vec3(-1.039062, 0.0, 1.020417), vec3(-1.210938, 0.078125, 1.05948), vec3(-1.03125, -0.039062, 0.957917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[388] =
      Triangle(vec3(1.234375, 0.25, 1.098542), vec3(1.210938, 0.078125, 1.05948), vec3(1.265625, 0.289062, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[389] =
      Triangle(vec3(-1.234375, 0.25, 1.098542), vec3(-1.210938, 0.078125, 1.05948), vec3(-1.1875, 0.09375, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[390] =
      Triangle(vec3(1.171875, 0.359375, 1.09073), vec3(1.265625, 0.289062, 1.05948), vec3(1.1875, 0.4375, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[391] =
      Triangle(vec3(-1.171875, 0.359375, 1.09073), vec3(-1.265625, 0.289062, 1.05948), vec3(-1.234375, 0.25, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[392] =
      Triangle(vec3(1.023438, 0.34375, 1.012605), vec3(1.1875, 0.4375, 1.043855), vec3(1.015625, 0.414062, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[393] =
      Triangle(vec3(-1.023438, 0.34375, 1.012605), vec3(-1.1875, 0.4375, 1.043855), vec3(-1.171875, 0.359375, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[394] =
      Triangle(vec3(1.015625, 0.414062, 0.942292), vec3(0.945312, 0.304688, 0.942292), vec3(1.023438, 0.34375, 1.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[395] =
      Triangle(vec3(-0.945312, 0.304688, 0.942292), vec3(-1.015625, 0.414062, 0.942292), vec3(-1.023438, 0.34375, 1.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[396] =
      Triangle(vec3(0.59375, -0.125, 0.817292), vec3(0.726562, 0.0, 0.723542), vec3(0.734375, -0.046875, 0.582917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[397] =
      Triangle(vec3(-0.59375, -0.125, 0.817292), vec3(-0.726562, 0.0, 0.723542), vec3(-0.71875, -0.023438, 0.825105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[398] =
      Triangle(vec3(0.773438, -0.140625, 0.77823), vec3(0.71875, -0.023438, 0.825105), vec3(0.59375, -0.125, 0.817292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[399] =
      Triangle(vec3(-0.773438, -0.140625, 0.77823), vec3(-0.71875, -0.023438, 0.825105), vec3(-0.828125, -0.070312, 0.786042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[400] =
      Triangle(vec3(0.851562, 0.234375, 0.598542), vec3(0.726562, 0.0, 0.723542), vec3(0.859375, 0.320312, 0.700105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[401] =
      Triangle(vec3(-0.726562, 0.0, 0.723542), vec3(-0.851562, 0.234375, 0.598542), vec3(-0.859375, 0.320312, 0.700105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[402] =
      Triangle(vec3(0.820312, 0.328125, 0.856355), vec3(0.921875, 0.359375, 0.87198), vec3(0.890625, 0.40625, 0.887605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[403] =
      Triangle(vec3(-0.921875, 0.359375, 0.87198), vec3(-0.820312, 0.328125, 0.856355), vec3(-0.890625, 0.40625, 0.887605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[404] =
      Triangle(vec3(0.828125, -0.070312, 0.786042), vec3(0.8125, -0.015625, 0.926667), vec3(0.71875, -0.023438, 0.825105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[405] =
      Triangle(vec3(-0.8125, -0.015625, 0.926667), vec3(-0.828125, -0.070312, 0.786042), vec3(-0.71875, -0.023438, 0.825105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[406] =
      Triangle(vec3(0.71875, 0.039062, 0.84073), vec3(0.8125, -0.015625, 0.926667), vec3(0.84375, 0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[407] =
      Triangle(vec3(-0.71875, 0.039062, 0.84073), vec3(-0.8125, -0.015625, 0.926667), vec3(-0.71875, -0.023438, 0.825105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[408] =
      Triangle(vec3(0.757812, 0.09375, 0.926667), vec3(0.84375, 0.015625, 0.926667), vec3(0.820312, 0.085938, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[409] =
      Triangle(vec3(-0.84375, 0.015625, 0.926667), vec3(-0.757812, 0.09375, 0.926667), vec3(-0.820312, 0.085938, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[410] =
      Triangle(vec3(0.796875, 0.203125, 0.864167), vec3(0.757812, 0.09375, 0.926667), vec3(0.835938, 0.171875, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[411] =
      Triangle(vec3(-0.796875, 0.203125, 0.864167), vec3(-0.757812, 0.09375, 0.926667), vec3(-0.71875, 0.039062, 0.84073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[412] =
      Triangle(vec3(0.796875, 0.203125, 0.864167), vec3(0.890625, 0.242188, 0.918855), vec3(0.84375, 0.289062, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[413] =
      Triangle(vec3(-0.796875, 0.203125, 0.864167), vec3(-0.890625, 0.242188, 0.918855), vec3(-0.835938, 0.171875, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[414] =
      Triangle(vec3(0.84375, 0.289062, 0.864167), vec3(0.945312, 0.304688, 0.942292), vec3(0.921875, 0.359375, 0.87198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[415] =
      Triangle(vec3(-0.84375, 0.289062, 0.864167), vec3(-0.945312, 0.304688, 0.942292), vec3(-0.890625, 0.242188, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[416] =
      Triangle(vec3(0.859375, 0.320312, 0.700105), vec3(0.84375, 0.289062, 0.864167), vec3(0.820312, 0.328125, 0.856355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[417] =
      Triangle(vec3(-0.84375, 0.289062, 0.864167), vec3(-0.859375, 0.320312, 0.700105), vec3(-0.820312, 0.328125, 0.856355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[418] =
      Triangle(vec3(0.726562, 0.0, 0.723542), vec3(0.796875, 0.203125, 0.864167), vec3(0.859375, 0.320312, 0.700105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[419] =
      Triangle(vec3(-0.726562, 0.0, 0.723542), vec3(-0.796875, 0.203125, 0.864167), vec3(-0.71875, 0.039062, 0.84073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[420] =
      Triangle(vec3(0.726562, 0.0, 0.723542), vec3(0.71875, -0.023438, 0.825105), vec3(0.71875, 0.039062, 0.84073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[421] =
      Triangle(vec3(-0.71875, 0.039062, 0.84073), vec3(-0.71875, -0.023438, 0.825105), vec3(-0.726562, 0.0, 0.723542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[422] =
      Triangle(vec3(0.945312, 0.304688, 0.942292), vec3(0.890625, 0.234375, 0.973542), vec3(0.953125, 0.289062, 0.99698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[423] =
      Triangle(vec3(-0.890625, 0.234375, 0.973542), vec3(-0.945312, 0.304688, 0.942292), vec3(-0.953125, 0.289062, 0.99698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[424] =
      Triangle(vec3(0.835938, 0.171875, 0.926667), vec3(0.890625, 0.234375, 0.973542), vec3(0.890625, 0.242188, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[425] =
      Triangle(vec3(-0.835938, 0.171875, 0.926667), vec3(-0.890625, 0.234375, 0.973542), vec3(-0.84375, 0.171875, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[426] =
      Triangle(vec3(0.835938, 0.171875, 0.926667), vec3(0.765625, 0.09375, 0.973542), vec3(0.84375, 0.171875, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[427] =
      Triangle(vec3(-0.765625, 0.09375, 0.973542), vec3(-0.835938, 0.171875, 0.926667), vec3(-0.84375, 0.171875, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[428] =
      Triangle(vec3(0.820312, 0.085938, 0.926667), vec3(0.765625, 0.09375, 0.973542), vec3(0.757812, 0.09375, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[429] =
      Triangle(vec3(-0.820312, 0.085938, 0.926667), vec3(-0.765625, 0.09375, 0.973542), vec3(-0.828125, 0.078125, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[430] =
      Triangle(vec3(0.84375, 0.015625, 0.926667), vec3(0.828125, 0.078125, 0.973542), vec3(0.820312, 0.085938, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[431] =
      Triangle(vec3(-0.84375, 0.015625, 0.926667), vec3(-0.828125, 0.078125, 0.973542), vec3(-0.851562, 0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[432] =
      Triangle(vec3(0.84375, 0.015625, 0.926667), vec3(0.8125, -0.015625, 0.973542), vec3(0.851562, 0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[433] =
      Triangle(vec3(-0.8125, -0.015625, 0.973542), vec3(-0.84375, 0.015625, 0.926667), vec3(-0.851562, 0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[434] =
      Triangle(vec3(0.8125, -0.015625, 0.926667), vec3(0.882812, -0.015625, 0.918855), vec3(0.8125, -0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[435] =
      Triangle(vec3(-0.882812, -0.015625, 0.918855), vec3(-0.8125, -0.015625, 0.926667), vec3(-0.8125, -0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[436] =
      Triangle(vec3(1.023438, 0.34375, 1.012605), vec3(0.953125, 0.289062, 0.99698), vec3(1.039062, 0.328125, 1.067292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[437] =
      Triangle(vec3(-0.953125, 0.289062, 0.99698), vec3(-1.023438, 0.34375, 1.012605), vec3(-1.039062, 0.328125, 1.067292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[438] =
      Triangle(vec3(1.171875, 0.359375, 1.09073), vec3(1.039062, 0.328125, 1.067292), vec3(1.1875, 0.34375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[439] =
      Triangle(vec3(-1.039062, 0.328125, 1.067292), vec3(-1.171875, 0.359375, 1.09073), vec3(-1.1875, 0.34375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[440] =
      Triangle(vec3(1.234375, 0.25, 1.098542), vec3(1.1875, 0.34375, 1.137605), vec3(1.257812, 0.242188, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[441] =
      Triangle(vec3(-1.1875, 0.34375, 1.137605), vec3(-1.234375, 0.25, 1.098542), vec3(-1.257812, 0.242188, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[442] =
      Triangle(vec3(1.234375, 0.25, 1.098542), vec3(1.210938, 0.085938, 1.137605), vec3(1.1875, 0.09375, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[443] =
      Triangle(vec3(-1.234375, 0.25, 1.098542), vec3(-1.210938, 0.085938, 1.137605), vec3(-1.257812, 0.242188, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[444] =
      Triangle(vec3(1.1875, 0.09375, 1.098542), vec3(1.046875, 0.0, 1.075105), vec3(1.039062, 0.0, 1.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[445] =
      Triangle(vec3(-1.1875, 0.09375, 1.098542), vec3(-1.046875, 0.0, 1.075105), vec3(-1.210938, 0.085938, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[446] =
      Triangle(vec3(1.039062, 0.0, 1.020417), vec3(0.882812, -0.015625, 0.918855), vec3(0.882812, -0.023438, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[447] =
      Triangle(vec3(-1.039062, 0.0, 1.020417), vec3(-0.882812, -0.015625, 0.918855), vec3(-1.046875, 0.0, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[448] =
      Triangle(vec3(0.851562, 0.015625, 0.973542), vec3(0.890625, 0.109375, 0.981355), vec3(0.828125, 0.078125, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[449] =
      Triangle(vec3(-0.851562, 0.015625, 0.973542), vec3(-0.890625, 0.109375, 0.981355), vec3(-0.9375, 0.0625, 0.989167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[450] =
      Triangle(vec3(0.9375, 0.0625, 0.989167), vec3(0.960938, 0.171875, 1.004792), vec3(0.890625, 0.109375, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[451] =
      Triangle(vec3(-0.9375, 0.0625, 0.989167), vec3(-0.960938, 0.171875, 1.004792), vec3(-1.0, 0.125, 1.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[452] =
      Triangle(vec3(0.960938, 0.171875, 1.004792), vec3(1.054688, 0.1875, 1.036042), vec3(1.015625, 0.234375, 1.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[453] =
      Triangle(vec3(-1.054688, 0.1875, 1.036042), vec3(-0.960938, 0.171875, 1.004792), vec3(-1.015625, 0.234375, 1.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[454] =
      Triangle(vec3(1.054688, 0.1875, 1.036042), vec3(1.085938, 0.273438, 1.043855), vec3(1.015625, 0.234375, 1.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[455] =
      Triangle(vec3(-1.054688, 0.1875, 1.036042), vec3(-1.085938, 0.273438, 1.043855), vec3(-1.109375, 0.210938, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[456] =
      Triangle(vec3(1.039062, 0.328125, 1.067292), vec3(1.015625, 0.234375, 1.02823), vec3(1.085938, 0.273438, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[457] =
      Triangle(vec3(-1.015625, 0.234375, 1.02823), vec3(-1.039062, 0.328125, 1.067292), vec3(-1.085938, 0.273438, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[458] =
      Triangle(vec3(0.960938, 0.171875, 1.004792), vec3(0.953125, 0.289062, 0.99698), vec3(0.890625, 0.234375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[459] =
      Triangle(vec3(-0.960938, 0.171875, 1.004792), vec3(-0.953125, 0.289062, 0.99698), vec3(-1.015625, 0.234375, 1.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[460] =
      Triangle(vec3(0.84375, 0.171875, 0.973542), vec3(0.960938, 0.171875, 1.004792), vec3(0.890625, 0.234375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[461] =
      Triangle(vec3(-0.84375, 0.171875, 0.973542), vec3(-0.960938, 0.171875, 1.004792), vec3(-0.890625, 0.109375, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[462] =
      Triangle(vec3(0.828125, 0.078125, 0.973542), vec3(0.84375, 0.171875, 0.973542), vec3(0.765625, 0.09375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[463] =
      Triangle(vec3(-0.84375, 0.171875, 0.973542), vec3(-0.828125, 0.078125, 0.973542), vec3(-0.765625, 0.09375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[464] =
      Triangle(vec3(0.882812, -0.015625, 0.918855), vec3(0.851562, 0.015625, 0.973542), vec3(0.8125, -0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[465] =
      Triangle(vec3(-0.882812, -0.015625, 0.918855), vec3(-0.851562, 0.015625, 0.973542), vec3(-0.9375, 0.0625, 0.989167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[466] =
      Triangle(vec3(1.046875, 0.0, 1.075105), vec3(0.9375, 0.0625, 0.989167), vec3(0.882812, -0.015625, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[467] =
      Triangle(vec3(-0.9375, 0.0625, 0.989167), vec3(-1.046875, 0.0, 1.075105), vec3(-0.882812, -0.015625, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[468] =
      Triangle(vec3(1.054688, 0.1875, 1.036042), vec3(1.046875, 0.0, 1.075105), vec3(1.210938, 0.085938, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[469] =
      Triangle(vec3(-1.054688, 0.1875, 1.036042), vec3(-1.046875, 0.0, 1.075105), vec3(-1.0, 0.125, 1.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[470] =
      Triangle(vec3(1.109375, 0.210938, 1.043855), vec3(1.210938, 0.085938, 1.137605), vec3(1.257812, 0.242188, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[471] =
      Triangle(vec3(-1.109375, 0.210938, 1.043855), vec3(-1.210938, 0.085938, 1.137605), vec3(-1.054688, 0.1875, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[472] =
      Triangle(vec3(1.1875, 0.34375, 1.137605), vec3(1.109375, 0.210938, 1.043855), vec3(1.257812, 0.242188, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[473] =
      Triangle(vec3(-1.109375, 0.210938, 1.043855), vec3(-1.1875, 0.34375, 1.137605), vec3(-1.257812, 0.242188, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[474] =
      Triangle(vec3(1.039062, 0.328125, 1.067292), vec3(1.085938, 0.273438, 1.043855), vec3(1.1875, 0.34375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[475] =
      Triangle(vec3(-1.1875, 0.34375, 1.137605), vec3(-1.085938, 0.273438, 1.043855), vec3(-1.039062, 0.328125, 1.067292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[476] =
      Triangle(vec3(1.039062, -0.101562, 0.981355), vec3(0.789062, -0.125, 0.981355), vec3(1.039062, -0.085938, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[477] =
      Triangle(vec3(-0.789062, -0.125, 0.981355), vec3(-1.039062, -0.101562, 0.981355), vec3(-1.039062, -0.085938, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[478] =
      Triangle(vec3(1.28125, 0.054688, 1.082917), vec3(1.039062, -0.085938, 1.145417), vec3(1.3125, 0.054688, 1.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[479] =
      Triangle(vec3(-1.039062, -0.085938, 1.145417), vec3(-1.28125, 0.054688, 1.082917), vec3(-1.3125, 0.054688, 1.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[480] =
      Triangle(vec3(1.28125, 0.054688, 1.082917), vec3(1.367188, 0.296875, 1.15323), vec3(1.351562, 0.320312, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[481] =
      Triangle(vec3(-1.28125, 0.054688, 1.082917), vec3(-1.367188, 0.296875, 1.15323), vec3(-1.3125, 0.054688, 1.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[482] =
      Triangle(vec3(1.351562, 0.320312, 1.075105), vec3(1.25, 0.46875, 1.200105), vec3(1.234375, 0.507812, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[483] =
      Triangle(vec3(-1.351562, 0.320312, 1.075105), vec3(-1.25, 0.46875, 1.200105), vec3(-1.367188, 0.296875, 1.15323),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[484] =
      Triangle(vec3(1.234375, 0.507812, 1.075105), vec3(1.023438, 0.4375, 1.137605), vec3(1.023438, 0.476562, 0.96573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[485] =
      Triangle(vec3(-1.234375, 0.507812, 1.075105), vec3(-1.023438, 0.4375, 1.137605), vec3(-1.25, 0.46875, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[486] =
      Triangle(vec3(1.023438, 0.476562, 0.96573), vec3(0.859375, 0.382812, 1.036042), vec3(0.890625, 0.40625, 0.887605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[487] =
      Triangle(vec3(-1.023438, 0.476562, 0.96573), vec3(-0.859375, 0.382812, 1.036042), vec3(-1.023438, 0.4375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[488] =
      Triangle(vec3(1.039062, -0.085938, 1.145417), vec3(0.859375, 0.382812, 1.036042), vec3(1.023438, 0.4375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[489] =
      Triangle(vec3(-1.039062, -0.085938, 1.145417), vec3(-0.859375, 0.382812, 1.036042), vec3(-0.789062, -0.125, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[490] =
      Triangle(vec3(1.023438, 0.4375, 1.137605), vec3(1.3125, 0.054688, 1.18448), vec3(1.039062, -0.085938, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[491] =
      Triangle(vec3(-1.3125, 0.054688, 1.18448), vec3(-1.023438, 0.4375, 1.137605), vec3(-1.039062, -0.085938, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[492] =
      Triangle(vec3(1.25, 0.46875, 1.200105), vec3(1.367188, 0.296875, 1.15323), vec3(1.3125, 0.054688, 1.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[493] =
      Triangle(vec3(-1.3125, 0.054688, 1.18448), vec3(-1.367188, 0.296875, 1.15323), vec3(-1.25, 0.46875, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[494] =
      Triangle(vec3(0.820312, 0.328125, 0.856355), vec3(0.859375, 0.382812, 1.036042), vec3(0.773438, 0.265625, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[495] =
      Triangle(vec3(-0.820312, 0.328125, 0.856355), vec3(-0.859375, 0.382812, 1.036042), vec3(-0.890625, 0.40625, 0.887605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[496] =
      Triangle(vec3(0.773438, 0.265625, 1.09073), vec3(0.789062, -0.125, 0.981355), vec3(0.640625, -0.007812, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[497] =
      Triangle(vec3(-0.789062, -0.125, 0.981355), vec3(-0.773438, 0.265625, 1.09073), vec3(-0.640625, -0.007812, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[498] =
      Triangle(vec3(0.59375, -0.125, 0.817292), vec3(0.789062, -0.125, 0.981355), vec3(0.773438, -0.140625, 0.77823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[499] =
      Triangle(vec3(-0.789062, -0.125, 0.981355), vec3(-0.59375, -0.125, 0.817292), vec3(-0.773438, -0.140625, 0.77823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[500] =
      Triangle(vec3(0.46875, 0.242188, -0.104583), vec3(0.4375, 0.164062, -0.112395), vec3(0.5, 0.09375, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[501] =
      Triangle(vec3(-0.5, 0.09375, -0.03427), vec3(-0.4375, 0.164062, -0.112395), vec3(-0.46875, 0.242188, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[502] =
      Triangle(vec3(0.5625, 0.242188, -0.018645), vec3(0.5, 0.09375, -0.03427), vec3(0.546875, 0.054688, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[503] =
      Triangle(vec3(-0.546875, 0.054688, 0.075105), vec3(-0.5, 0.09375, -0.03427), vec3(-0.5625, 0.242188, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[504] =
      Triangle(vec3(0.5, 0.09375, -0.03427), vec3(0.351562, 0.03125, -0.06552), vec3(0.351562, -0.023438, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[505] =
      Triangle(vec3(-0.351562, -0.023438, 0.036042), vec3(-0.351562, 0.03125, -0.06552), vec3(-0.5, 0.09375, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[506] =
      Triangle(vec3(0.4375, 0.164062, -0.112395), vec3(0.351562, 0.132812, -0.12802), vec3(0.351562, 0.03125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[507] =
      Triangle(vec3(-0.351562, 0.03125, -0.06552), vec3(-0.351562, 0.132812, -0.12802), vec3(-0.4375, 0.164062, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[508] =
      Triangle(vec3(0.351562, 0.132812, -0.12802), vec3(0.273438, 0.164062, -0.143645), vec3(0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[509] =
      Triangle(vec3(-0.203125, 0.09375, -0.088958), vec3(-0.273438, 0.164062, -0.143645), vec3(-0.351562, 0.132812, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[510] =
      Triangle(vec3(0.351562, 0.03125, -0.06552), vec3(0.203125, 0.09375, -0.088958), vec3(0.15625, 0.054688, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[511] =
      Triangle(vec3(-0.15625, 0.054688, 0.004792), vec3(-0.203125, 0.09375, -0.088958), vec3(-0.351562, 0.03125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[512] =
      Triangle(vec3(0.140625, 0.242188, -0.088958), vec3(0.078125, 0.242188, -0.00302), vec3(0.15625, 0.054688, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[513] =
      Triangle(vec3(-0.140625, 0.242188, -0.088958), vec3(-0.203125, 0.09375, -0.088958), vec3(-0.15625, 0.054688, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[514] =
      Triangle(vec3(0.273438, 0.164062, -0.143645), vec3(0.242188, 0.242188, -0.143645), vec3(0.140625, 0.242188, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[515] =
      Triangle(vec3(-0.140625, 0.242188, -0.088958), vec3(-0.242188, 0.242188, -0.143645), vec3(-0.273438, 0.164062, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[516] =
      Triangle(vec3(0.242188, 0.242188, -0.143645), vec3(0.273438, 0.328125, -0.143645), vec3(0.203125, 0.390625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[517] =
      Triangle(vec3(-0.203125, 0.390625, -0.088958), vec3(-0.273438, 0.328125, -0.143645), vec3(-0.242188, 0.242188, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[518] =
      Triangle(vec3(0.203125, 0.390625, -0.088958), vec3(0.15625, 0.4375, 0.004792), vec3(0.078125, 0.242188, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[519] =
      Triangle(vec3(-0.203125, 0.390625, -0.088958), vec3(-0.140625, 0.242188, -0.088958), vec3(-0.078125, 0.242188, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[520] =
      Triangle(vec3(0.351562, 0.453125, -0.06552), vec3(0.351562, 0.515625, 0.036042), vec3(0.15625, 0.4375, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[521] =
      Triangle(vec3(-0.351562, 0.453125, -0.06552), vec3(-0.203125, 0.390625, -0.088958), vec3(-0.15625, 0.4375, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[522] =
      Triangle(vec3(0.351562, 0.359375, -0.12802), vec3(0.351562, 0.453125, -0.06552), vec3(0.203125, 0.390625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[523] =
      Triangle(vec3(-0.351562, 0.359375, -0.12802), vec3(-0.273438, 0.328125, -0.143645), vec3(-0.203125, 0.390625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[524] =
      Triangle(vec3(0.4375, 0.328125, -0.112395), vec3(0.5, 0.390625, -0.03427), vec3(0.351562, 0.453125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[525] =
      Triangle(vec3(-0.4375, 0.328125, -0.112395), vec3(-0.351562, 0.359375, -0.12802), vec3(-0.351562, 0.453125, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[526] =
      Triangle(vec3(0.5, 0.390625, -0.03427), vec3(0.546875, 0.4375, 0.075105), vec3(0.351562, 0.515625, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[527] =
      Triangle(vec3(-0.5, 0.390625, -0.03427), vec3(-0.351562, 0.453125, -0.06552), vec3(-0.351562, 0.515625, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[528] =
      Triangle(vec3(0.5625, 0.242188, -0.018645), vec3(0.625, 0.242188, 0.09073), vec3(0.546875, 0.4375, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[529] =
      Triangle(vec3(-0.5625, 0.242188, -0.018645), vec3(-0.5, 0.390625, -0.03427), vec3(-0.546875, 0.4375, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[530] =
      Triangle(vec3(0.46875, 0.242188, -0.104583), vec3(0.5625, 0.242188, -0.018645), vec3(0.5, 0.390625, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[531] =
      Triangle(vec3(-0.46875, 0.242188, -0.104583), vec3(-0.4375, 0.328125, -0.112395), vec3(-0.5, 0.390625, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[532] =
      Triangle(vec3(0.4375, 0.328125, -0.112395), vec3(0.445312, 0.335938, -0.12802), vec3(0.476562, 0.242188, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[533] =
      Triangle(vec3(-0.4375, 0.328125, -0.112395), vec3(-0.46875, 0.242188, -0.104583), vec3(-0.476562, 0.242188, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[534] =
      Triangle(vec3(0.351562, 0.359375, -0.12802), vec3(0.351562, 0.375, -0.151458), vec3(0.445312, 0.335938, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[535] =
      Triangle(vec3(-0.351562, 0.359375, -0.12802), vec3(-0.4375, 0.328125, -0.112395), vec3(-0.445312, 0.335938, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[536] =
      Triangle(vec3(0.273438, 0.328125, -0.143645), vec3(0.265625, 0.335938, -0.167083), vec3(0.351562, 0.375, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[537] =
      Triangle(vec3(-0.273438, 0.328125, -0.143645), vec3(-0.351562, 0.359375, -0.12802), vec3(-0.351562, 0.375, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[538] =
      Triangle(vec3(0.242188, 0.242188, -0.143645), vec3(0.226562, 0.242188, -0.167083), vec3(0.265625, 0.335938, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[539] =
      Triangle(vec3(-0.242188, 0.242188, -0.143645), vec3(-0.273438, 0.328125, -0.143645), vec3(-0.265625, 0.335938, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[540] =
      Triangle(vec3(0.242188, 0.242188, -0.143645), vec3(0.273438, 0.164062, -0.143645), vec3(0.265625, 0.15625, -0.167083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[541] =
      Triangle(vec3(-0.265625, 0.15625, -0.167083), vec3(-0.273438, 0.164062, -0.143645), vec3(-0.242188, 0.242188, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[542] =
      Triangle(vec3(0.273438, 0.164062, -0.143645), vec3(0.351562, 0.132812, -0.12802), vec3(0.351562, 0.117188, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[543] =
      Triangle(vec3(-0.351562, 0.117188, -0.151458), vec3(-0.351562, 0.132812, -0.12802), vec3(-0.273438, 0.164062, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[544] =
      Triangle(vec3(0.351562, 0.132812, -0.12802), vec3(0.4375, 0.164062, -0.112395), vec3(0.445312, 0.15625, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[545] =
      Triangle(vec3(-0.445312, 0.15625, -0.12802), vec3(-0.4375, 0.164062, -0.112395), vec3(-0.351562, 0.132812, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[546] =
      Triangle(vec3(0.4375, 0.164062, -0.112395), vec3(0.46875, 0.242188, -0.104583), vec3(0.476562, 0.242188, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[547] =
      Triangle(vec3(-0.476562, 0.242188, -0.120208), vec3(-0.46875, 0.242188, -0.104583), vec3(-0.4375, 0.164062, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[548] =
      Triangle(vec3(0.164062, -0.929688, 0.020417), vec3(0.0, -0.945312, 0.012605), vec3(0.0, -0.984375, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[549] =
      Triangle(vec3(-0.164062, -0.929688, 0.020417), vec3(-0.179688, -0.96875, 0.098542), vec3(0.0, -0.984375, 0.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[550] =
      Triangle(vec3(0.234375, -0.914062, 0.020417), vec3(0.164062, -0.929688, 0.020417), vec3(0.179688, -0.96875, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[551] =
      Triangle(vec3(-0.234375, -0.914062, 0.020417), vec3(-0.328125, -0.945312, 0.129792), vec3(-0.179688, -0.96875, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[552] =
      Triangle(vec3(0.367188, -0.890625, 0.12198), vec3(0.265625, -0.820312, -0.010833), vec3(0.234375, -0.914062, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[553] =
      Triangle(vec3(-0.234375, -0.914062, 0.020417), vec3(-0.265625, -0.820312, -0.010833), vec3(-0.367188, -0.890625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[554] =
      Triangle(vec3(0.351562, -0.695312, 0.082917), vec3(0.25, -0.703125, -0.03427), vec3(0.265625, -0.820312, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[555] =
      Triangle(vec3(-0.265625, -0.820312, -0.010833), vec3(-0.25, -0.703125, -0.03427), vec3(-0.351562, -0.695312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[556] =
      Triangle(vec3(0.3125, -0.4375, 0.082917), vec3(0.210938, -0.445312, -0.057708), vec3(0.25, -0.703125, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[557] =
      Triangle(vec3(-0.25, -0.703125, -0.03427), vec3(-0.210938, -0.445312, -0.057708), vec3(-0.3125, -0.4375, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[558] =
      Triangle(vec3(0.203125, -0.1875, 0.09073), vec3(0.4375, -0.140625, 0.12198), vec3(0.398438, -0.046875, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[559] =
      Triangle(vec3(-0.398438, -0.046875, -0.018645), vec3(-0.4375, -0.140625, 0.12198), vec3(-0.203125, -0.1875, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[560] =
      Triangle(vec3(0.632812, -0.039062, 0.114167), vec3(0.617188, 0.054688, 0.02823), vec3(0.398438, -0.046875, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[561] =
      Triangle(vec3(-0.632812, -0.039062, 0.114167), vec3(-0.4375, -0.140625, 0.12198), vec3(-0.398438, -0.046875, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[562] =
      Triangle(vec3(0.632812, -0.039062, 0.114167), vec3(0.828125, 0.148438, 0.207917), vec3(0.726562, 0.203125, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[563] =
      Triangle(vec3(-0.726562, 0.203125, 0.051667), vec3(-0.828125, 0.148438, 0.207917), vec3(-0.632812, -0.039062, 0.114167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[564] =
      Triangle(vec3(0.859375, 0.429688, 0.05948), vec3(0.742188, 0.375, -0.00302), vec3(0.726562, 0.203125, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[565] =
      Triangle(vec3(-0.859375, 0.429688, 0.05948), vec3(-0.828125, 0.148438, 0.207917), vec3(-0.726562, 0.203125, 0.051667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[566] =
      Triangle(vec3(0.710938, 0.484375, 0.02823), vec3(0.6875, 0.414062, -0.073333), vec3(0.742188, 0.375, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[567] =
      Triangle(vec3(-0.710938, 0.484375, 0.02823), vec3(-0.859375, 0.429688, 0.05948), vec3(-0.742188, 0.375, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[568] =
      Triangle(vec3(0.492188, 0.601562, -0.03427), vec3(0.4375, 0.546875, -0.143645), vec3(0.6875, 0.414062, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[569] =
      Triangle(vec3(-0.492188, 0.601562, -0.03427), vec3(-0.710938, 0.484375, 0.02823), vec3(-0.6875, 0.414062, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[570] =
      Triangle(vec3(0.492188, 0.601562, -0.03427), vec3(0.320312, 0.757812, -0.081145), vec3(0.3125, 0.640625, -0.182708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[571] =
      Triangle(vec3(-0.3125, 0.640625, -0.182708), vec3(-0.320312, 0.757812, -0.081145), vec3(-0.492188, 0.601562, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[572] =
      Triangle(vec3(0.15625, 0.71875, -0.104583), vec3(0.203125, 0.617188, -0.198333), vec3(0.3125, 0.640625, -0.182708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[573] =
      Triangle(vec3(-0.15625, 0.71875, -0.104583), vec3(-0.320312, 0.757812, -0.081145), vec3(-0.3125, 0.640625, -0.182708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[574] =
      Triangle(vec3(0.0625, 0.492188, -0.09677), vec3(0.101562, 0.429688, -0.19052), vec3(0.203125, 0.617188, -0.198333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[575] =
      Triangle(vec3(-0.0625, 0.492188, -0.09677), vec3(-0.15625, 0.71875, -0.104583), vec3(-0.203125, 0.617188, -0.198333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[576] =
      Triangle(vec3(0.0, 0.429688, -0.088958), vec3(0.0, 0.351562, -0.167083), vec3(0.101562, 0.429688, -0.19052),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[577] =
      Triangle(vec3(0.0, 0.429688, -0.088958), vec3(-0.0625, 0.492188, -0.09677), vec3(-0.101562, 0.429688, -0.19052),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[578] =
      Triangle(vec3(0.25, 0.46875, -0.104583), vec3(0.203125, 0.617188, -0.198333), vec3(0.101562, 0.429688, -0.19052),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[579] =
      Triangle(vec3(-0.25, 0.46875, -0.104583), vec3(-0.164062, 0.414062, -0.120208), vec3(-0.101562, 0.429688, -0.19052),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[580] =
      Triangle(vec3(0.25, 0.46875, -0.104583), vec3(0.328125, 0.476562, -0.088958), vec3(0.3125, 0.640625, -0.182708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[581] =
      Triangle(vec3(-0.3125, 0.640625, -0.182708), vec3(-0.328125, 0.476562, -0.088958), vec3(-0.25, 0.46875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[582] =
      Triangle(vec3(0.4375, 0.546875, -0.143645), vec3(0.3125, 0.640625, -0.182708), vec3(0.328125, 0.476562, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[583] =
      Triangle(vec3(-0.4375, 0.546875, -0.143645), vec3(-0.429688, 0.4375, -0.06552), vec3(-0.328125, 0.476562, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[584] =
      Triangle(vec3(0.6875, 0.414062, -0.073333), vec3(0.4375, 0.546875, -0.143645), vec3(0.429688, 0.4375, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[585] =
      Triangle(vec3(-0.6875, 0.414062, -0.073333), vec3(-0.601562, 0.375, -0.010833), vec3(-0.429688, 0.4375, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[586] =
      Triangle(vec3(0.742188, 0.375, -0.00302), vec3(0.6875, 0.414062, -0.073333), vec3(0.601562, 0.375, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[587] =
      Triangle(vec3(-0.742188, 0.375, -0.00302), vec3(-0.640625, 0.296875, 0.004792), vec3(-0.601562, 0.375, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[588] =
      Triangle(vec3(0.726562, 0.203125, 0.051667), vec3(0.742188, 0.375, -0.00302), vec3(0.640625, 0.296875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[589] =
      Triangle(vec3(-0.726562, 0.203125, 0.051667), vec3(-0.625, 0.1875, 0.004792), vec3(-0.640625, 0.296875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[590] =
      Triangle(vec3(0.617188, 0.054688, 0.02823), vec3(0.726562, 0.203125, 0.051667), vec3(0.625, 0.1875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[591] =
      Triangle(vec3(-0.617188, 0.054688, 0.02823), vec3(-0.492188, 0.0625, -0.018645), vec3(-0.625, 0.1875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[592] =
      Triangle(vec3(0.398438, -0.046875, -0.018645), vec3(0.617188, 0.054688, 0.02823), vec3(0.492188, 0.0625, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[593] =
      Triangle(vec3(-0.398438, -0.046875, -0.018645), vec3(-0.375, 0.015625, -0.049895), vec3(-0.492188, 0.0625, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[594] =
      Triangle(vec3(0.125, -0.101562, -0.15927), vec3(0.398438, -0.046875, -0.018645), vec3(0.375, 0.015625, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[595] =
      Triangle(vec3(-0.125, -0.101562, -0.15927), vec3(-0.203125, 0.09375, -0.088958), vec3(-0.375, 0.015625, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[596] =
      Triangle(vec3(0.203125, 0.09375, -0.088958), vec3(0.164062, 0.140625, -0.09677), vec3(0.0, 0.046875, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[597] =
      Triangle(vec3(0.0, 0.046875, -0.073333), vec3(-0.164062, 0.140625, -0.09677), vec3(-0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[598] =
      Triangle(vec3(0.101562, 0.429688, -0.19052), vec3(0.0, 0.351562, -0.167083), vec3(0.125, 0.304688, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[599] =
      Triangle(vec3(-0.101562, 0.429688, -0.19052), vec3(-0.164062, 0.414062, -0.120208), vec3(-0.125, 0.304688, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[600] =
      Triangle(vec3(0.125, 0.304688, -0.112395), vec3(0.0, 0.351562, -0.167083), vec3(0.0, 0.210938, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[601] =
      Triangle(vec3(0.0, 0.210938, -0.112395), vec3(0.0, 0.351562, -0.167083), vec3(-0.125, 0.304688, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[602] =
      Triangle(vec3(0.164062, 0.140625, -0.09677), vec3(0.132812, 0.210938, -0.104583), vec3(0.0, 0.210938, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[603] =
      Triangle(vec3(-0.164062, 0.140625, -0.09677), vec3(0.0, 0.046875, -0.073333), vec3(0.0, 0.210938, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[604] =
      Triangle(vec3(0.0625, -0.882812, -0.042083), vec3(0.0, -0.890625, -0.03427), vec3(0.0, -0.945312, 0.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[605] =
      Triangle(vec3(0.0, -0.945312, 0.012605), vec3(0.0, -0.890625, -0.03427), vec3(-0.0625, -0.882812, -0.042083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[606] =
      Triangle(vec3(0.117188, -0.835938, -0.057708), vec3(0.0625, -0.882812, -0.042083), vec3(0.164062, -0.929688, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[607] =
      Triangle(vec3(-0.164062, -0.929688, 0.020417), vec3(-0.0625, -0.882812, -0.042083), vec3(-0.117188, -0.835938, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[608] =
      Triangle(vec3(0.117188, -0.835938, -0.057708), vec3(0.234375, -0.914062, 0.020417), vec3(0.265625, -0.820312, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[609] =
      Triangle(vec3(-0.117188, -0.835938, -0.057708), vec3(-0.109375, -0.71875, -0.081145), vec3(-0.265625, -0.820312, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[610] =
      Triangle(vec3(0.210938, -0.445312, -0.057708), vec3(0.078125, -0.445312, -0.09677), vec3(0.117188, -0.6875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[611] =
      Triangle(vec3(-0.117188, -0.6875, -0.081145), vec3(-0.078125, -0.445312, -0.09677), vec3(-0.210938, -0.445312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[612] =
      Triangle(vec3(0.109375, -0.71875, -0.081145), vec3(0.265625, -0.820312, -0.010833), vec3(0.25, -0.703125, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[613] =
      Triangle(vec3(-0.25, -0.703125, -0.03427), vec3(-0.265625, -0.820312, -0.010833), vec3(-0.109375, -0.71875, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[614] =
      Triangle(vec3(0.0, -0.328125, -0.088958), vec3(0.0, -0.445312, -0.09677), vec3(0.078125, -0.445312, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[615] =
      Triangle(vec3(0.0, -0.328125, -0.088958), vec3(-0.085938, -0.289062, -0.088958), vec3(-0.078125, -0.445312, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[616] =
      Triangle(vec3(0.078125, -0.445312, -0.09677), vec3(0.0, -0.445312, -0.09677), vec3(0.0, -0.679688, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[617] =
      Triangle(vec3(-0.078125, -0.445312, -0.09677), vec3(-0.117188, -0.6875, -0.081145), vec3(0.0, -0.679688, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[618] =
      Triangle(vec3(0.109375, -0.71875, -0.081145), vec3(0.117188, -0.6875, -0.081145), vec3(0.0, -0.679688, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[619] =
      Triangle(vec3(-0.109375, -0.71875, -0.081145), vec3(0.0, -0.765625, -0.081145), vec3(0.0, -0.679688, -0.081145),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[620] =
      Triangle(vec3(0.125, -0.226562, -0.09677), vec3(0.132812, -0.226562, -0.143645), vec3(0.09375, -0.273438, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[621] =
      Triangle(vec3(-0.09375, -0.273438, -0.12802), vec3(-0.132812, -0.226562, -0.143645), vec3(-0.125, -0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[622] =
      Triangle(vec3(0.101562, -0.148438, -0.088958), vec3(0.109375, -0.132812, -0.12802), vec3(0.132812, -0.226562, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[623] =
      Triangle(vec3(-0.132812, -0.226562, -0.143645), vec3(-0.109375, -0.132812, -0.12802), vec3(-0.101562, -0.148438, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[624] =
      Triangle(vec3(0.039062, -0.125, -0.12802), vec3(0.109375, -0.132812, -0.12802), vec3(0.101562, -0.148438, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[625] =
      Triangle(vec3(-0.039062, -0.125, -0.12802), vec3(0.0, -0.140625, -0.088958), vec3(-0.101562, -0.148438, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[626] =
      Triangle(vec3(0.0, -0.1875, -0.143645), vec3(0.039062, -0.125, -0.12802), vec3(0.0, -0.140625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[627] =
      Triangle(vec3(0.085938, -0.289062, -0.088958), vec3(0.09375, -0.273438, -0.12802), vec3(0.0, -0.320312, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[628] =
      Triangle(vec3(-0.085938, -0.289062, -0.088958), vec3(0.0, -0.328125, -0.088958), vec3(0.0, -0.320312, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[629] =
      Triangle(vec3(0.09375, -0.273438, -0.12802), vec3(0.078125, -0.25, -0.151458), vec3(0.0, -0.289062, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[630] =
      Triangle(vec3(-0.09375, -0.273438, -0.12802), vec3(0.0, -0.320312, -0.12802), vec3(0.0, -0.289062, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[631] =
      Triangle(vec3(0.0, -0.1875, -0.143645), vec3(0.0, -0.203125, -0.174895), vec3(0.046875, -0.148438, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[632] =
      Triangle(vec3(-0.046875, -0.148438, -0.15927), vec3(0.0, -0.203125, -0.174895), vec3(0.0, -0.1875, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[633] =
      Triangle(vec3(0.039062, -0.125, -0.12802), vec3(0.046875, -0.148438, -0.15927), vec3(0.09375, -0.15625, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[634] =
      Triangle(vec3(-0.09375, -0.15625, -0.15927), vec3(-0.046875, -0.148438, -0.15927), vec3(-0.039062, -0.125, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[635] =
      Triangle(vec3(0.09375, -0.15625, -0.15927), vec3(0.109375, -0.226562, -0.174895), vec3(0.132812, -0.226562, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[636] =
      Triangle(vec3(-0.09375, -0.15625, -0.15927), vec3(-0.109375, -0.132812, -0.12802), vec3(-0.132812, -0.226562, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[637] =
      Triangle(vec3(0.132812, -0.226562, -0.143645), vec3(0.109375, -0.226562, -0.174895), vec3(0.078125, -0.25, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[638] =
      Triangle(vec3(-0.078125, -0.25, -0.151458), vec3(-0.109375, -0.226562, -0.174895), vec3(-0.132812, -0.226562, -0.143645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[639] =
      Triangle(vec3(0.109375, -0.226562, -0.174895), vec3(0.09375, -0.15625, -0.15927), vec3(0.046875, -0.148438, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[640] =
      Triangle(vec3(-0.109375, -0.226562, -0.174895), vec3(0.0, -0.203125, -0.174895), vec3(-0.046875, -0.148438, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[641] =
      Triangle(vec3(0.0, -0.203125, -0.174895), vec3(0.0, -0.289062, -0.151458), vec3(0.078125, -0.25, -0.151458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[642] =
      Triangle(vec3(-0.078125, -0.25, -0.151458), vec3(0.0, -0.289062, -0.151458), vec3(0.0, -0.203125, -0.174895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[643] =
      Triangle(vec3(0.0, -0.140625, -0.088958), vec3(0.101562, -0.148438, -0.088958), vec3(0.125, -0.101562, -0.15927),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[644] =
      Triangle(vec3(-0.125, -0.101562, -0.15927), vec3(-0.101562, -0.148438, -0.088958), vec3(0.0, -0.140625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[645] =
      Triangle(vec3(0.101562, -0.148438, -0.088958), vec3(0.125, -0.226562, -0.09677), vec3(0.164062, -0.242188, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[646] =
      Triangle(vec3(-0.164062, -0.242188, -0.057708), vec3(-0.125, -0.226562, -0.09677), vec3(-0.101562, -0.148438, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[647] =
      Triangle(vec3(0.085938, -0.289062, -0.088958), vec3(0.179688, -0.3125, -0.057708), vec3(0.164062, -0.242188, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[648] =
      Triangle(vec3(-0.085938, -0.289062, -0.088958), vec3(-0.125, -0.226562, -0.09677), vec3(-0.164062, -0.242188, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[649] =
      Triangle(vec3(0.078125, -0.445312, -0.09677), vec3(0.210938, -0.445312, -0.057708), vec3(0.179688, -0.3125, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[650] =
      Triangle(vec3(-0.078125, -0.445312, -0.09677), vec3(-0.085938, -0.289062, -0.088958), vec3(-0.179688, -0.3125, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[651] =
      Triangle(vec3(0.257812, -0.3125, 0.098542), vec3(0.179688, -0.3125, -0.057708), vec3(0.210938, -0.445312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[652] =
      Triangle(vec3(-0.257812, -0.3125, 0.098542), vec3(-0.3125, -0.4375, 0.082917), vec3(-0.210938, -0.445312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[653] =
      Triangle(vec3(0.234375, -0.25, 0.098542), vec3(0.164062, -0.242188, -0.057708), vec3(0.179688, -0.3125, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[654] =
      Triangle(vec3(-0.234375, -0.25, 0.098542), vec3(-0.257812, -0.3125, 0.098542), vec3(-0.179688, -0.3125, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[655] =
      Triangle(vec3(0.203125, -0.1875, 0.09073), vec3(0.125, -0.101562, -0.15927), vec3(0.164062, -0.242188, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[656] =
      Triangle(vec3(-0.164062, -0.242188, -0.057708), vec3(-0.125, -0.101562, -0.15927), vec3(-0.203125, -0.1875, 0.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[657] =
      Triangle(vec3(0.0, -0.765625, -0.081145), vec3(0.0, -0.773438, -0.06552), vec3(0.09375, -0.742188, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[658] =
      Triangle(vec3(0.0, -0.765625, -0.081145), vec3(-0.109375, -0.71875, -0.081145), vec3(-0.09375, -0.742188, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[659] =
      Triangle(vec3(0.117188, -0.835938, -0.057708), vec3(0.109375, -0.71875, -0.081145), vec3(0.09375, -0.742188, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[660] =
      Triangle(vec3(-0.09375, -0.742188, -0.073333), vec3(-0.109375, -0.71875, -0.081145), vec3(-0.117188, -0.835938, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[661] =
      Triangle(vec3(0.0625, -0.882812, -0.042083), vec3(0.117188, -0.835938, -0.057708), vec3(0.09375, -0.820312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[662] =
      Triangle(vec3(-0.09375, -0.820312, -0.057708), vec3(-0.117188, -0.835938, -0.057708), vec3(-0.0625, -0.882812, -0.042083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[663] =
      Triangle(vec3(0.0, -0.890625, -0.03427), vec3(0.0625, -0.882812, -0.042083), vec3(0.046875, -0.867188, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[664] =
      Triangle(vec3(-0.046875, -0.867188, -0.03427), vec3(-0.0625, -0.882812, -0.042083), vec3(0.0, -0.890625, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[665] =
      Triangle(vec3(0.046875, -0.867188, -0.03427), vec3(0.046875, -0.851562, 0.020417), vec3(0.0, -0.859375, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[666] =
      Triangle(vec3(-0.046875, -0.867188, -0.03427), vec3(0.0, -0.875, -0.03427), vec3(0.0, -0.859375, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[667] =
      Triangle(vec3(0.046875, -0.867188, -0.03427), vec3(0.09375, -0.820312, -0.057708), vec3(0.09375, -0.8125, 0.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[668] =
      Triangle(vec3(-0.09375, -0.8125, 0.012605), vec3(-0.09375, -0.820312, -0.057708), vec3(-0.046875, -0.867188, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[669] =
      Triangle(vec3(0.09375, -0.820312, -0.057708), vec3(0.09375, -0.742188, -0.073333), vec3(0.09375, -0.75, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[670] =
      Triangle(vec3(-0.09375, -0.75, -0.010833), vec3(-0.09375, -0.742188, -0.073333), vec3(-0.09375, -0.820312, -0.057708),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[671] =
      Triangle(vec3(0.0, -0.773438, -0.06552), vec3(0.0, -0.78125, -0.00302), vec3(0.09375, -0.75, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[672] =
      Triangle(vec3(0.0, -0.773438, -0.06552), vec3(-0.09375, -0.742188, -0.073333), vec3(-0.09375, -0.75, -0.010833),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[673] =
      Triangle(vec3(0.0, -0.78125, -0.00302), vec3(0.0, -0.859375, 0.020417), vec3(0.046875, -0.851562, 0.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[674] =
      Triangle(vec3(-0.046875, -0.851562, 0.020417), vec3(0.0, -0.859375, 0.020417), vec3(0.0, -0.78125, -0.00302),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[675] =
      Triangle(vec3(0.132812, 0.210938, -0.104583), vec3(0.164062, 0.140625, -0.09677), vec3(0.1875, 0.15625, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[676] =
      Triangle(vec3(-0.1875, 0.15625, -0.120208), vec3(-0.164062, 0.140625, -0.09677), vec3(-0.132812, 0.210938, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[677] =
      Triangle(vec3(0.125, 0.304688, -0.112395), vec3(0.132812, 0.210938, -0.104583), vec3(0.171875, 0.21875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[678] =
      Triangle(vec3(-0.171875, 0.21875, -0.12802), vec3(-0.132812, 0.210938, -0.104583), vec3(-0.125, 0.304688, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[679] =
      Triangle(vec3(0.125, 0.304688, -0.112395), vec3(0.179688, 0.296875, -0.12802), vec3(0.210938, 0.375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[680] =
      Triangle(vec3(-0.125, 0.304688, -0.112395), vec3(-0.164062, 0.414062, -0.120208), vec3(-0.210938, 0.375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[681] =
      Triangle(vec3(0.203125, 0.09375, -0.088958), vec3(0.226562, 0.109375, -0.12802), vec3(0.1875, 0.15625, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[682] =
      Triangle(vec3(-0.203125, 0.09375, -0.088958), vec3(-0.164062, 0.140625, -0.09677), vec3(-0.1875, 0.15625, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[683] =
      Triangle(vec3(0.203125, 0.09375, -0.088958), vec3(0.375, 0.015625, -0.049895), vec3(0.375, 0.0625, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[684] =
      Triangle(vec3(-0.375, 0.0625, -0.088958), vec3(-0.375, 0.015625, -0.049895), vec3(-0.203125, 0.09375, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[685] =
      Triangle(vec3(0.375, 0.015625, -0.049895), vec3(0.492188, 0.0625, -0.018645), vec3(0.476562, 0.101562, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[686] =
      Triangle(vec3(-0.476562, 0.101562, -0.06552), vec3(-0.492188, 0.0625, -0.018645), vec3(-0.375, 0.015625, -0.049895),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[687] =
      Triangle(vec3(0.492188, 0.0625, -0.018645), vec3(0.625, 0.1875, 0.004792), vec3(0.578125, 0.195312, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[688] =
      Triangle(vec3(-0.578125, 0.195312, -0.026458), vec3(-0.625, 0.1875, 0.004792), vec3(-0.492188, 0.0625, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[689] =
      Triangle(vec3(0.625, 0.1875, 0.004792), vec3(0.640625, 0.296875, 0.004792), vec3(0.585938, 0.289062, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[690] =
      Triangle(vec3(-0.585938, 0.289062, -0.03427), vec3(-0.640625, 0.296875, 0.004792), vec3(-0.625, 0.1875, 0.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[691] =
      Triangle(vec3(0.601562, 0.375, -0.010833), vec3(0.5625, 0.351562, -0.042083), vec3(0.585938, 0.289062, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[692] =
      Triangle(vec3(-0.601562, 0.375, -0.010833), vec3(-0.640625, 0.296875, 0.004792), vec3(-0.585938, 0.289062, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[693] =
      Triangle(vec3(0.429688, 0.4375, -0.06552), vec3(0.421875, 0.398438, -0.120208), vec3(0.5625, 0.351562, -0.042083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[694] =
      Triangle(vec3(-0.429688, 0.4375, -0.06552), vec3(-0.601562, 0.375, -0.010833), vec3(-0.5625, 0.351562, -0.042083),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[695] =
      Triangle(vec3(0.429688, 0.4375, -0.06552), vec3(0.328125, 0.476562, -0.088958), vec3(0.335938, 0.429688, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[696] =
      Triangle(vec3(-0.335938, 0.429688, -0.104583), vec3(-0.328125, 0.476562, -0.088958), vec3(-0.429688, 0.4375, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[697] =
      Triangle(vec3(0.328125, 0.476562, -0.088958), vec3(0.25, 0.46875, -0.104583), vec3(0.273438, 0.421875, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[698] =
      Triangle(vec3(-0.273438, 0.421875, -0.120208), vec3(-0.25, 0.46875, -0.104583), vec3(-0.328125, 0.476562, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[699] =
      Triangle(vec3(0.25, 0.46875, -0.104583), vec3(0.164062, 0.414062, -0.120208), vec3(0.210938, 0.375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[700] =
      Triangle(vec3(-0.210938, 0.375, -0.12802), vec3(-0.164062, 0.414062, -0.120208), vec3(-0.25, 0.46875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[701] =
      Triangle(vec3(0.210938, 0.375, -0.12802), vec3(0.234375, 0.359375, -0.104583), vec3(0.28125, 0.398438, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[702] =
      Triangle(vec3(-0.210938, 0.375, -0.12802), vec3(-0.273438, 0.421875, -0.120208), vec3(-0.28125, 0.398438, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[703] =
      Triangle(vec3(0.335938, 0.429688, -0.104583), vec3(0.273438, 0.421875, -0.120208), vec3(0.28125, 0.398438, -0.112395),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[704] =
      Triangle(vec3(-0.28125, 0.398438, -0.112395), vec3(-0.273438, 0.421875, -0.120208), vec3(-0.335938, 0.429688, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[705] =
      Triangle(vec3(0.335938, 0.429688, -0.104583), vec3(0.335938, 0.40625, -0.09677), vec3(0.414062, 0.390625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[706] =
      Triangle(vec3(-0.335938, 0.429688, -0.104583), vec3(-0.421875, 0.398438, -0.120208), vec3(-0.414062, 0.390625, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[707] =
      Triangle(vec3(0.421875, 0.398438, -0.120208), vec3(0.414062, 0.390625, -0.09677), vec3(0.53125, 0.335938, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[708] =
      Triangle(vec3(-0.421875, 0.398438, -0.120208), vec3(-0.5625, 0.351562, -0.042083), vec3(-0.53125, 0.335938, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[709] =
      Triangle(vec3(0.585938, 0.289062, -0.03427), vec3(0.5625, 0.351562, -0.042083), vec3(0.53125, 0.335938, -0.026458),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[710] =
      Triangle(vec3(-0.53125, 0.335938, -0.026458), vec3(-0.5625, 0.351562, -0.042083), vec3(-0.585938, 0.289062, -0.03427),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[711] =
      Triangle(vec3(0.585938, 0.289062, -0.03427), vec3(0.554688, 0.28125, -0.018645), vec3(0.546875, 0.210938, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[712] =
      Triangle(vec3(-0.585938, 0.289062, -0.03427), vec3(-0.578125, 0.195312, -0.026458), vec3(-0.546875, 0.210938, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[713] =
      Triangle(vec3(0.476562, 0.101562, -0.06552), vec3(0.578125, 0.195312, -0.026458), vec3(0.546875, 0.210938, -0.018645),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[714] =
      Triangle(vec3(-0.546875, 0.210938, -0.018645), vec3(-0.578125, 0.195312, -0.026458), vec3(-0.476562, 0.101562, -0.06552),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[715] =
      Triangle(vec3(0.476562, 0.101562, -0.06552), vec3(0.460938, 0.117188, -0.049895), vec3(0.375, 0.085938, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[716] =
      Triangle(vec3(-0.476562, 0.101562, -0.06552), vec3(-0.375, 0.0625, -0.088958), vec3(-0.375, 0.085938, -0.073333),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[717] =
      Triangle(vec3(0.375, 0.0625, -0.088958), vec3(0.375, 0.085938, -0.073333), vec3(0.242188, 0.125, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[718] =
      Triangle(vec3(-0.375, 0.0625, -0.088958), vec3(-0.226562, 0.109375, -0.12802), vec3(-0.242188, 0.125, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[719] =
      Triangle(vec3(0.1875, 0.15625, -0.120208), vec3(0.226562, 0.109375, -0.12802), vec3(0.242188, 0.125, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[720] =
      Triangle(vec3(-0.242188, 0.125, -0.104583), vec3(-0.226562, 0.109375, -0.12802), vec3(-0.1875, 0.15625, -0.120208),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[721] =
      Triangle(vec3(0.210938, 0.375, -0.12802), vec3(0.179688, 0.296875, -0.12802), vec3(0.195312, 0.296875, -0.104583),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[722] =
      Triangle(vec3(-0.195312, 0.296875, -0.104583), vec3(-0.179688, 0.296875, -0.12802), vec3(-0.210938, 0.375, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[723] =
      Triangle(vec3(0.179688, 0.296875, -0.12802), vec3(0.171875, 0.21875, -0.12802), vec3(0.195312, 0.226562, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[724] =
      Triangle(vec3(-0.195312, 0.226562, -0.09677), vec3(-0.171875, 0.21875, -0.12802), vec3(-0.179688, 0.296875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[725] =
      Triangle(vec3(0.171875, 0.21875, -0.12802), vec3(0.1875, 0.15625, -0.120208), vec3(0.203125, 0.171875, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[726] =
      Triangle(vec3(-0.203125, 0.171875, -0.09677), vec3(-0.1875, 0.15625, -0.120208), vec3(-0.171875, 0.21875, -0.12802),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[727] =
      Triangle(vec3(0.0, 0.429688, -0.088958), vec3(0.0625, 0.492188, -0.09677), vec3(0.109375, 0.460938, 0.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[728] =
      Triangle(vec3(-0.109375, 0.460938, 0.043855), vec3(-0.0625, 0.492188, -0.09677), vec3(0.0, 0.429688, -0.088958),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[729] =
      Triangle(vec3(0.0625, 0.492188, -0.09677), vec3(0.15625, 0.71875, -0.104583), vec3(0.195312, 0.664062, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[730] =
      Triangle(vec3(-0.195312, 0.664062, 0.036042), vec3(-0.15625, 0.71875, -0.104583), vec3(-0.0625, 0.492188, -0.09677),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[731] =
      Triangle(vec3(0.320312, 0.757812, -0.081145), vec3(0.335938, 0.6875, 0.05948), vec3(0.195312, 0.664062, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[732] =
      Triangle(vec3(-0.320312, 0.757812, -0.081145), vec3(-0.15625, 0.71875, -0.104583), vec3(-0.195312, 0.664062, 0.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[733] =
      Triangle(vec3(0.492188, 0.601562, -0.03427), vec3(0.484375, 0.554688, 0.098542), vec3(0.335938, 0.6875, 0.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[734] =
      Triangle(vec3(-0.492188, 0.601562, -0.03427), vec3(-0.320312, 0.757812, -0.081145), vec3(-0.335938, 0.6875, 0.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[735] =
      Triangle(vec3(0.710938, 0.484375, 0.02823), vec3(0.679688, 0.453125, 0.161042), vec3(0.484375, 0.554688, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[736] =
      Triangle(vec3(-0.710938, 0.484375, 0.02823), vec3(-0.492188, 0.601562, -0.03427), vec3(-0.484375, 0.554688, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[737] =
      Triangle(vec3(0.710938, 0.484375, 0.02823), vec3(0.859375, 0.429688, 0.05948), vec3(0.796875, 0.40625, 0.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[738] =
      Triangle(vec3(-0.796875, 0.40625, 0.192292), vec3(-0.859375, 0.429688, 0.05948), vec3(-0.710938, 0.484375, 0.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[739] =
      Triangle(vec3(0.828125, 0.148438, 0.207917), vec3(0.773438, 0.164062, 0.27823), vec3(0.796875, 0.40625, 0.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[740] =
      Triangle(vec3(-0.828125, 0.148438, 0.207917), vec3(-0.859375, 0.429688, 0.05948), vec3(-0.796875, 0.40625, 0.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[741] =
      Triangle(vec3(0.828125, 0.148438, 0.207917), vec3(0.632812, -0.039062, 0.114167), vec3(0.601562, 0.0, 0.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[742] =
      Triangle(vec3(-0.601562, 0.0, 0.239167), vec3(-0.632812, -0.039062, 0.114167), vec3(-0.828125, 0.148438, 0.207917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[743] =
      Triangle(vec3(0.632812, -0.039062, 0.114167), vec3(0.4375, -0.140625, 0.12198), vec3(0.4375, -0.09375, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[744] =
      Triangle(vec3(-0.4375, -0.09375, 0.18448), vec3(-0.4375, -0.140625, 0.12198), vec3(-0.632812, -0.039062, 0.114167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[745] =
      Triangle(vec3(0.0, -0.484375, 0.37198), vec3(0.179688, -0.414062, 0.395417), vec3(0.125, -0.539062, 0.293855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[746] =
      Triangle(vec3(0.0, -0.484375, 0.37198), vec3(0.0, -0.570312, 0.332917), vec3(-0.125, -0.539062, 0.293855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[747] =
      Triangle(vec3(0.0, -0.570312, 0.332917), vec3(0.125, -0.539062, 0.293855), vec3(0.140625, -0.757812, 0.286042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[748] =
      Triangle(vec3(0.0, -0.570312, 0.332917), vec3(0.0, -0.804688, 0.30948), vec3(-0.140625, -0.757812, 0.286042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[749] =
      Triangle(vec3(0.0, -0.804688, 0.30948), vec3(0.140625, -0.757812, 0.286042), vec3(0.164062, -0.945312, 0.21573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[750] =
      Triangle(vec3(0.0, -0.804688, 0.30948), vec3(0.0, -0.976562, 0.192292), vec3(-0.164062, -0.945312, 0.21573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[751] =
      Triangle(vec3(0.179688, -0.96875, 0.098542), vec3(0.0, -0.984375, 0.075105), vec3(0.0, -0.976562, 0.192292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[752] =
      Triangle(vec3(0.0, -0.976562, 0.192292), vec3(0.0, -0.984375, 0.075105), vec3(-0.179688, -0.96875, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[753] =
      Triangle(vec3(0.328125, -0.945312, 0.129792), vec3(0.179688, -0.96875, 0.098542), vec3(0.164062, -0.945312, 0.21573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[754] =
      Triangle(vec3(-0.164062, -0.945312, 0.21573), vec3(-0.179688, -0.96875, 0.098542), vec3(-0.328125, -0.945312, 0.129792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[755] =
      Triangle(vec3(0.367188, -0.890625, 0.12198), vec3(0.328125, -0.945312, 0.129792), vec3(0.328125, -0.914062, 0.254792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[756] =
      Triangle(vec3(-0.328125, -0.914062, 0.254792), vec3(-0.328125, -0.945312, 0.129792), vec3(-0.367188, -0.890625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[757] =
      Triangle(vec3(0.351562, -0.695312, 0.082917), vec3(0.367188, -0.890625, 0.12198), vec3(0.289062, -0.710938, 0.270417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[758] =
      Triangle(vec3(-0.289062, -0.710938, 0.270417), vec3(-0.367188, -0.890625, 0.12198), vec3(-0.351562, -0.695312, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[759] =
      Triangle(vec3(0.289062, -0.710938, 0.270417), vec3(0.140625, -0.757812, 0.286042), vec3(0.125, -0.539062, 0.293855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[760] =
      Triangle(vec3(-0.125, -0.539062, 0.293855), vec3(-0.140625, -0.757812, 0.286042), vec3(-0.289062, -0.710938, 0.270417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[761] =
      Triangle(vec3(0.328125, -0.914062, 0.254792), vec3(0.164062, -0.945312, 0.21573), vec3(0.140625, -0.757812, 0.286042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[762] =
      Triangle(vec3(-0.328125, -0.914062, 0.254792), vec3(-0.289062, -0.710938, 0.270417), vec3(-0.140625, -0.757812, 0.286042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[763] =
      Triangle(vec3(0.25, -0.5, 0.262605), vec3(0.125, -0.539062, 0.293855), vec3(0.179688, -0.414062, 0.395417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[764] =
      Triangle(vec3(-0.25, -0.5, 0.262605), vec3(-0.234375, -0.351562, 0.24698), vec3(-0.179688, -0.414062, 0.395417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[765] =
      Triangle(vec3(0.3125, -0.4375, 0.082917), vec3(0.351562, -0.695312, 0.082917), vec3(0.25, -0.5, 0.262605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[766] =
      Triangle(vec3(-0.25, -0.5, 0.262605), vec3(-0.351562, -0.695312, 0.082917), vec3(-0.3125, -0.4375, 0.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[767] =
      Triangle(vec3(0.21875, -0.28125, 0.223542), vec3(0.210938, -0.226562, 0.18448), vec3(0.234375, -0.25, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[768] =
      Triangle(vec3(-0.21875, -0.28125, 0.223542), vec3(-0.257812, -0.3125, 0.098542), vec3(-0.234375, -0.25, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[769] =
      Triangle(vec3(0.234375, -0.351562, 0.24698), vec3(0.21875, -0.28125, 0.223542), vec3(0.257812, -0.3125, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[770] =
      Triangle(vec3(-0.234375, -0.351562, 0.24698), vec3(-0.3125, -0.4375, 0.082917), vec3(-0.257812, -0.3125, 0.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[771] =
      Triangle(vec3(0.234375, -0.25, 0.098542), vec3(0.210938, -0.226562, 0.18448), vec3(0.203125, -0.171875, 0.15323),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[772] =
      Triangle(vec3(-0.234375, -0.25, 0.098542), vec3(-0.203125, -0.1875, 0.09073), vec3(-0.203125, -0.171875, 0.15323),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[773] =
      Triangle(vec3(0.203125, -0.171875, 0.15323), vec3(0.4375, -0.09375, 0.18448), vec3(0.4375, -0.140625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[774] =
      Triangle(vec3(-0.203125, -0.171875, 0.15323), vec3(-0.203125, -0.1875, 0.09073), vec3(-0.4375, -0.140625, 0.12198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[775] =
      Triangle(vec3(0.335938, 0.054688, 1.317292), vec3(0.34375, -0.148438, 1.192292), vec3(0.0, -0.195312, 1.325105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[776] =
      Triangle(vec3(-0.335938, 0.054688, 1.317292), vec3(0.0, 0.070312, 1.481355), vec3(0.0, -0.195312, 1.325105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[777] =
      Triangle(vec3(0.34375, -0.148438, 1.192292), vec3(0.296875, -0.3125, 0.918855), vec3(0.0, -0.382812, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[778] =
      Triangle(vec3(-0.34375, -0.148438, 1.192292), vec3(0.0, -0.195312, 1.325105), vec3(0.0, -0.382812, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[779] =
      Triangle(vec3(0.0, -0.382812, 1.004792), vec3(0.296875, -0.3125, 0.918855), vec3(0.210938, -0.390625, 0.489167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[780] =
      Triangle(vec3(-0.210938, -0.390625, 0.489167), vec3(-0.296875, -0.3125, 0.918855), vec3(0.0, -0.382812, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[781] =
      Triangle(vec3(0.0, -0.460938, 0.46573), vec3(0.210938, -0.390625, 0.489167), vec3(0.179688, -0.414062, 0.395417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[782] =
      Triangle(vec3(-0.179688, -0.414062, 0.395417), vec3(-0.210938, -0.390625, 0.489167), vec3(0.0, -0.460938, 0.46573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[783] =
      Triangle(vec3(0.179688, -0.414062, 0.395417), vec3(0.210938, -0.390625, 0.489167), vec3(0.21875, -0.28125, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[784] =
      Triangle(vec3(-0.179688, -0.414062, 0.395417), vec3(-0.234375, -0.351562, 0.24698), vec3(-0.21875, -0.28125, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[785] =
      Triangle(vec3(0.773438, 0.164062, 0.27823), vec3(0.601562, 0.0, 0.239167), vec3(0.734375, -0.046875, 0.582917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[786] =
      Triangle(vec3(-0.734375, -0.046875, 0.582917), vec3(-0.601562, 0.0, 0.239167), vec3(-0.773438, 0.164062, 0.27823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[787] =
      Triangle(vec3(0.460938, 0.4375, 1.356355), vec3(0.335938, 0.054688, 1.317292), vec3(0.0, 0.070312, 1.481355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[788] =
      Triangle(vec3(-0.460938, 0.4375, 1.356355), vec3(0.0, 0.5625, 1.504792), vec3(0.0, 0.070312, 1.481355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[789] =
      Triangle(vec3(0.453125, 0.851562, 0.418855), vec3(0.453125, 0.929688, 0.723542), vec3(0.0, 0.984375, 0.731355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[790] =
      Triangle(vec3(-0.453125, 0.851562, 0.418855), vec3(0.0, 0.898438, 0.364167), vec3(0.0, 0.984375, 0.731355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[791] =
      Triangle(vec3(0.0, 0.984375, 0.731355), vec3(0.453125, 0.929688, 0.723542), vec3(0.453125, 0.867188, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[792] =
      Triangle(vec3(-0.453125, 0.867188, 1.036042), vec3(-0.453125, 0.929688, 0.723542), vec3(0.0, 0.984375, 0.731355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[793] =
      Triangle(vec3(0.0, 0.898438, 1.200105), vec3(0.453125, 0.867188, 1.036042), vec3(0.460938, 0.4375, 1.356355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[794] =
      Triangle(vec3(-0.460938, 0.4375, 1.356355), vec3(-0.453125, 0.867188, 1.036042), vec3(0.0, 0.898438, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[795] =
      Triangle(vec3(0.679688, 0.453125, 0.161042), vec3(0.796875, 0.40625, 0.192292), vec3(0.726562, 0.40625, 0.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[796] =
      Triangle(vec3(-0.726562, 0.40625, 0.317292), vec3(-0.796875, 0.40625, 0.192292), vec3(-0.679688, 0.453125, 0.161042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[797] =
      Triangle(vec3(0.632812, 0.453125, 0.37198), vec3(0.726562, 0.40625, 0.317292), vec3(0.796875, 0.5625, 0.52823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[798] =
      Triangle(vec3(-0.796875, 0.5625, 0.52823), vec3(-0.726562, 0.40625, 0.317292), vec3(-0.632812, 0.453125, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[799] =
      Triangle(vec3(0.640625, 0.703125, 0.598542), vec3(0.796875, 0.5625, 0.52823), vec3(0.796875, 0.617188, 0.770417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[800] =
      Triangle(vec3(-0.796875, 0.617188, 0.770417), vec3(-0.796875, 0.5625, 0.52823), vec3(-0.640625, 0.703125, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[801] =
      Triangle(vec3(0.640625, 0.75, 0.848542), vec3(0.796875, 0.617188, 0.770417), vec3(0.796875, 0.539062, 1.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[802] =
      Triangle(vec3(-0.796875, 0.539062, 1.012605), vec3(-0.796875, 0.617188, 0.770417), vec3(-0.640625, 0.75, 0.848542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[803] =
      Triangle(vec3(0.617188, 0.328125, 1.239167), vec3(0.640625, 0.679688, 1.098542), vec3(0.796875, 0.539062, 1.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[804] =
      Triangle(vec3(-0.617188, 0.328125, 1.239167), vec3(-0.773438, 0.265625, 1.09073), vec3(-0.796875, 0.539062, 1.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[805] =
      Triangle(vec3(0.460938, 0.4375, 1.356355), vec3(0.453125, 0.867188, 1.036042), vec3(0.640625, 0.679688, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[806] =
      Triangle(vec3(-0.640625, 0.679688, 1.098542), vec3(-0.453125, 0.867188, 1.036042), vec3(-0.460938, 0.4375, 1.356355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[807] =
      Triangle(vec3(0.453125, 0.867188, 1.036042), vec3(0.453125, 0.929688, 0.723542), vec3(0.640625, 0.75, 0.848542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[808] =
      Triangle(vec3(-0.640625, 0.75, 0.848542), vec3(-0.453125, 0.929688, 0.723542), vec3(-0.453125, 0.867188, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[809] =
      Triangle(vec3(0.453125, 0.929688, 0.723542), vec3(0.453125, 0.851562, 0.418855), vec3(0.640625, 0.703125, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[810] =
      Triangle(vec3(-0.640625, 0.703125, 0.598542), vec3(-0.453125, 0.851562, 0.418855), vec3(-0.453125, 0.929688, 0.723542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[811] =
      Triangle(vec3(0.453125, 0.851562, 0.418855), vec3(0.460938, 0.523438, 0.223542), vec3(0.632812, 0.453125, 0.37198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[812] =
      Triangle(vec3(-0.632812, 0.453125, 0.37198), vec3(-0.460938, 0.523438, 0.223542), vec3(-0.453125, 0.851562, 0.418855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[813] =
      Triangle(vec3(0.679688, 0.453125, 0.161042), vec3(0.632812, 0.453125, 0.37198), vec3(0.460938, 0.523438, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[814] =
      Triangle(vec3(-0.679688, 0.453125, 0.161042), vec3(-0.484375, 0.554688, 0.098542), vec3(-0.460938, 0.523438, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[815] =
      Triangle(vec3(0.460938, 0.523438, 0.223542), vec3(0.453125, 0.851562, 0.418855), vec3(0.0, 0.898438, 0.364167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[816] =
      Triangle(vec3(-0.460938, 0.523438, 0.223542), vec3(0.0, 0.570312, 0.082917), vec3(0.0, 0.898438, 0.364167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[817] =
      Triangle(vec3(0.109375, 0.460938, 0.043855), vec3(0.195312, 0.664062, 0.036042), vec3(0.335938, 0.6875, 0.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[818] =
      Triangle(vec3(-0.335938, 0.6875, 0.05948), vec3(-0.195312, 0.664062, 0.036042), vec3(-0.109375, 0.460938, 0.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[819] =
      Triangle(vec3(0.109375, 0.460938, 0.043855), vec3(0.484375, 0.554688, 0.098542), vec3(0.460938, 0.523438, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[820] =
      Triangle(vec3(-0.460938, 0.523438, 0.223542), vec3(-0.484375, 0.554688, 0.098542), vec3(-0.109375, 0.460938, 0.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[821] =
      Triangle(vec3(0.773438, 0.164062, 0.27823), vec3(0.851562, 0.234375, 0.598542), vec3(0.726562, 0.40625, 0.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[822] =
      Triangle(vec3(-0.773438, 0.164062, 0.27823), vec3(-0.796875, 0.40625, 0.192292), vec3(-0.726562, 0.40625, 0.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[823] =
      Triangle(vec3(0.851562, 0.234375, 0.598542), vec3(0.859375, 0.320312, 0.700105), vec3(0.796875, 0.5625, 0.52823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[824] =
      Triangle(vec3(-0.796875, 0.5625, 0.52823), vec3(-0.859375, 0.320312, 0.700105), vec3(-0.851562, 0.234375, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[825] =
      Triangle(vec3(0.859375, 0.320312, 0.700105), vec3(0.820312, 0.328125, 0.856355), vec3(0.796875, 0.617188, 0.770417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[826] =
      Triangle(vec3(-0.796875, 0.617188, 0.770417), vec3(-0.820312, 0.328125, 0.856355), vec3(-0.859375, 0.320312, 0.700105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[827] =
      Triangle(vec3(0.796875, 0.539062, 1.012605), vec3(0.796875, 0.617188, 0.770417), vec3(0.820312, 0.328125, 0.856355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[828] =
      Triangle(vec3(-0.796875, 0.539062, 1.012605), vec3(-0.773438, 0.265625, 1.09073), vec3(-0.820312, 0.328125, 0.856355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[829] =
      Triangle(vec3(0.296875, -0.3125, 0.918855), vec3(0.429688, -0.195312, 0.864167), vec3(0.40625, -0.171875, 0.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[830] =
      Triangle(vec3(-0.296875, -0.3125, 0.918855), vec3(-0.210938, -0.390625, 0.489167), vec3(-0.40625, -0.171875, 0.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[831] =
      Triangle(vec3(0.40625, -0.171875, 0.504792), vec3(0.429688, -0.195312, 0.864167), vec3(0.59375, -0.125, 0.817292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[832] =
      Triangle(vec3(-0.40625, -0.171875, 0.504792), vec3(-0.734375, -0.046875, 0.582917), vec3(-0.59375, -0.125, 0.817292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[833] =
      Triangle(vec3(0.601562, 0.0, 0.239167), vec3(0.4375, -0.09375, 0.18448), vec3(0.40625, -0.171875, 0.504792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[834] =
      Triangle(vec3(-0.40625, -0.171875, 0.504792), vec3(-0.4375, -0.09375, 0.18448), vec3(-0.601562, 0.0, 0.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[835] =
      Triangle(vec3(0.4375, -0.09375, 0.18448), vec3(0.210938, -0.226562, 0.18448), vec3(0.21875, -0.28125, 0.223542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[836] =
      Triangle(vec3(-0.21875, -0.28125, 0.223542), vec3(-0.210938, -0.226562, 0.18448), vec3(-0.4375, -0.09375, 0.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[837] =
      Triangle(vec3(0.640625, -0.007812, 1.082917), vec3(0.484375, 0.023438, 1.200105), vec3(0.617188, 0.328125, 1.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[838] =
      Triangle(vec3(-0.640625, -0.007812, 1.082917), vec3(-0.773438, 0.265625, 1.09073), vec3(-0.617188, 0.328125, 1.239167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[839] =
      Triangle(vec3(0.617188, 0.328125, 1.239167), vec3(0.484375, 0.023438, 1.200105), vec3(0.335938, 0.054688, 1.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[840] =
      Triangle(vec3(-0.617188, 0.328125, 1.239167), vec3(-0.460938, 0.4375, 1.356355), vec3(-0.335938, 0.054688, 1.317292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[841] =
      Triangle(vec3(0.429688, -0.195312, 0.864167), vec3(0.484375, 0.023438, 1.200105), vec3(0.640625, -0.007812, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[842] =
      Triangle(vec3(-0.429688, -0.195312, 0.864167), vec3(-0.59375, -0.125, 0.817292), vec3(-0.640625, -0.007812, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[843] =
      Triangle(vec3(0.34375, -0.148438, 1.192292), vec3(0.484375, 0.023438, 1.200105), vec3(0.429688, -0.195312, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[844] =
      Triangle(vec3(-0.34375, -0.148438, 1.192292), vec3(-0.296875, -0.3125, 0.918855), vec3(-0.429688, -0.195312, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[845] =
      Triangle(vec3(0.890625, 0.40625, 0.887605), vec3(0.921875, 0.359375, 0.87198), vec3(1.015625, 0.414062, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[846] =
      Triangle(vec3(-0.890625, 0.40625, 0.887605), vec3(-1.023438, 0.476562, 0.96573), vec3(-1.015625, 0.414062, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[847] =
      Triangle(vec3(1.023438, 0.476562, 0.96573), vec3(1.015625, 0.414062, 0.942292), vec3(1.1875, 0.4375, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[848] =
      Triangle(vec3(-1.1875, 0.4375, 1.043855), vec3(-1.015625, 0.414062, 0.942292), vec3(-1.023438, 0.476562, 0.96573),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[849] =
      Triangle(vec3(1.1875, 0.4375, 1.043855), vec3(1.265625, 0.289062, 1.05948), vec3(1.351562, 0.320312, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[850] =
      Triangle(vec3(-1.1875, 0.4375, 1.043855), vec3(-1.234375, 0.507812, 1.075105), vec3(-1.351562, 0.320312, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[851] =
      Triangle(vec3(1.265625, 0.289062, 1.05948), vec3(1.210938, 0.078125, 1.05948), vec3(1.28125, 0.054688, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[852] =
      Triangle(vec3(-1.265625, 0.289062, 1.05948), vec3(-1.351562, 0.320312, 1.075105), vec3(-1.28125, 0.054688, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[853] =
      Triangle(vec3(1.210938, 0.078125, 1.05948), vec3(1.03125, -0.039062, 0.957917), vec3(1.039062, -0.101562, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[854] =
      Triangle(vec3(-1.210938, 0.078125, 1.05948), vec3(-1.28125, 0.054688, 1.082917), vec3(-1.039062, -0.101562, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[855] =
      Triangle(vec3(1.039062, -0.101562, 0.981355), vec3(1.03125, -0.039062, 0.957917), vec3(0.828125, -0.070312, 0.786042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[856] =
      Triangle(vec3(-0.828125, -0.070312, 0.786042), vec3(-1.03125, -0.039062, 0.957917), vec3(-1.039062, -0.101562, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[857] =
      Triangle(vec3(1.03125, -0.039062, 0.957917), vec3(1.039062, 0.0, 1.020417), vec3(0.882812, -0.023438, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[858] =
      Triangle(vec3(-0.882812, -0.023438, 0.864167), vec3(-1.039062, 0.0, 1.020417), vec3(-1.03125, -0.039062, 0.957917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[859] =
      Triangle(vec3(1.210938, 0.078125, 1.05948), vec3(1.1875, 0.09375, 1.098542), vec3(1.039062, 0.0, 1.020417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[860] =
      Triangle(vec3(-1.039062, 0.0, 1.020417), vec3(-1.1875, 0.09375, 1.098542), vec3(-1.210938, 0.078125, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[861] =
      Triangle(vec3(1.234375, 0.25, 1.098542), vec3(1.1875, 0.09375, 1.098542), vec3(1.210938, 0.078125, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[862] =
      Triangle(vec3(-1.234375, 0.25, 1.098542), vec3(-1.265625, 0.289062, 1.05948), vec3(-1.210938, 0.078125, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[863] =
      Triangle(vec3(1.171875, 0.359375, 1.09073), vec3(1.234375, 0.25, 1.098542), vec3(1.265625, 0.289062, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[864] =
      Triangle(vec3(-1.171875, 0.359375, 1.09073), vec3(-1.1875, 0.4375, 1.043855), vec3(-1.265625, 0.289062, 1.05948),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[865] =
      Triangle(vec3(1.023438, 0.34375, 1.012605), vec3(1.171875, 0.359375, 1.09073), vec3(1.1875, 0.4375, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[866] =
      Triangle(vec3(-1.023438, 0.34375, 1.012605), vec3(-1.015625, 0.414062, 0.942292), vec3(-1.1875, 0.4375, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[867] =
      Triangle(vec3(1.015625, 0.414062, 0.942292), vec3(0.921875, 0.359375, 0.87198), vec3(0.945312, 0.304688, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[868] =
      Triangle(vec3(-0.945312, 0.304688, 0.942292), vec3(-0.921875, 0.359375, 0.87198), vec3(-1.015625, 0.414062, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[869] =
      Triangle(vec3(0.59375, -0.125, 0.817292), vec3(0.71875, -0.023438, 0.825105), vec3(0.726562, 0.0, 0.723542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[870] =
      Triangle(vec3(-0.59375, -0.125, 0.817292), vec3(-0.734375, -0.046875, 0.582917), vec3(-0.726562, 0.0, 0.723542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[871] =
      Triangle(vec3(0.773438, -0.140625, 0.77823), vec3(0.828125, -0.070312, 0.786042), vec3(0.71875, -0.023438, 0.825105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[872] =
      Triangle(vec3(-0.773438, -0.140625, 0.77823), vec3(-0.59375, -0.125, 0.817292), vec3(-0.71875, -0.023438, 0.825105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[873] =
      Triangle(vec3(0.851562, 0.234375, 0.598542), vec3(0.734375, -0.046875, 0.582917), vec3(0.726562, 0.0, 0.723542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[874] =
      Triangle(vec3(-0.726562, 0.0, 0.723542), vec3(-0.734375, -0.046875, 0.582917), vec3(-0.851562, 0.234375, 0.598542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[875] =
      Triangle(vec3(0.820312, 0.328125, 0.856355), vec3(0.84375, 0.289062, 0.864167), vec3(0.921875, 0.359375, 0.87198),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[876] =
      Triangle(vec3(-0.921875, 0.359375, 0.87198), vec3(-0.84375, 0.289062, 0.864167), vec3(-0.820312, 0.328125, 0.856355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[877] =
      Triangle(vec3(0.828125, -0.070312, 0.786042), vec3(0.882812, -0.023438, 0.864167), vec3(0.8125, -0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[878] =
      Triangle(vec3(-0.8125, -0.015625, 0.926667), vec3(-0.882812, -0.023438, 0.864167), vec3(-0.828125, -0.070312, 0.786042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[879] =
      Triangle(vec3(0.71875, 0.039062, 0.84073), vec3(0.71875, -0.023438, 0.825105), vec3(0.8125, -0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[880] =
      Triangle(vec3(-0.71875, 0.039062, 0.84073), vec3(-0.84375, 0.015625, 0.926667), vec3(-0.8125, -0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[881] =
      Triangle(vec3(0.757812, 0.09375, 0.926667), vec3(0.71875, 0.039062, 0.84073), vec3(0.84375, 0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[882] =
      Triangle(vec3(-0.84375, 0.015625, 0.926667), vec3(-0.71875, 0.039062, 0.84073), vec3(-0.757812, 0.09375, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[883] =
      Triangle(vec3(0.796875, 0.203125, 0.864167), vec3(0.71875, 0.039062, 0.84073), vec3(0.757812, 0.09375, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[884] =
      Triangle(vec3(-0.796875, 0.203125, 0.864167), vec3(-0.835938, 0.171875, 0.926667), vec3(-0.757812, 0.09375, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[885] =
      Triangle(vec3(0.796875, 0.203125, 0.864167), vec3(0.835938, 0.171875, 0.926667), vec3(0.890625, 0.242188, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[886] =
      Triangle(vec3(-0.796875, 0.203125, 0.864167), vec3(-0.84375, 0.289062, 0.864167), vec3(-0.890625, 0.242188, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[887] =
      Triangle(vec3(0.84375, 0.289062, 0.864167), vec3(0.890625, 0.242188, 0.918855), vec3(0.945312, 0.304688, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[888] =
      Triangle(vec3(-0.84375, 0.289062, 0.864167), vec3(-0.921875, 0.359375, 0.87198), vec3(-0.945312, 0.304688, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[889] =
      Triangle(vec3(0.859375, 0.320312, 0.700105), vec3(0.796875, 0.203125, 0.864167), vec3(0.84375, 0.289062, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[890] =
      Triangle(vec3(-0.84375, 0.289062, 0.864167), vec3(-0.796875, 0.203125, 0.864167), vec3(-0.859375, 0.320312, 0.700105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[891] =
      Triangle(vec3(0.726562, 0.0, 0.723542), vec3(0.71875, 0.039062, 0.84073), vec3(0.796875, 0.203125, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[892] =
      Triangle(vec3(-0.726562, 0.0, 0.723542), vec3(-0.859375, 0.320312, 0.700105), vec3(-0.796875, 0.203125, 0.864167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[893] =
      Triangle(vec3(0.945312, 0.304688, 0.942292), vec3(0.890625, 0.242188, 0.918855), vec3(0.890625, 0.234375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[894] =
      Triangle(vec3(-0.890625, 0.234375, 0.973542), vec3(-0.890625, 0.242188, 0.918855), vec3(-0.945312, 0.304688, 0.942292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[895] =
      Triangle(vec3(0.835938, 0.171875, 0.926667), vec3(0.84375, 0.171875, 0.973542), vec3(0.890625, 0.234375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[896] =
      Triangle(vec3(-0.835938, 0.171875, 0.926667), vec3(-0.890625, 0.242188, 0.918855), vec3(-0.890625, 0.234375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[897] =
      Triangle(vec3(0.835938, 0.171875, 0.926667), vec3(0.757812, 0.09375, 0.926667), vec3(0.765625, 0.09375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[898] =
      Triangle(vec3(-0.765625, 0.09375, 0.973542), vec3(-0.757812, 0.09375, 0.926667), vec3(-0.835938, 0.171875, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[899] =
      Triangle(vec3(0.820312, 0.085938, 0.926667), vec3(0.828125, 0.078125, 0.973542), vec3(0.765625, 0.09375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[900] =
      Triangle(vec3(-0.820312, 0.085938, 0.926667), vec3(-0.757812, 0.09375, 0.926667), vec3(-0.765625, 0.09375, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[901] =
      Triangle(vec3(0.84375, 0.015625, 0.926667), vec3(0.851562, 0.015625, 0.973542), vec3(0.828125, 0.078125, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[902] =
      Triangle(vec3(-0.84375, 0.015625, 0.926667), vec3(-0.820312, 0.085938, 0.926667), vec3(-0.828125, 0.078125, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[903] =
      Triangle(vec3(0.84375, 0.015625, 0.926667), vec3(0.8125, -0.015625, 0.926667), vec3(0.8125, -0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[904] =
      Triangle(vec3(-0.8125, -0.015625, 0.973542), vec3(-0.8125, -0.015625, 0.926667), vec3(-0.84375, 0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[905] =
      Triangle(vec3(0.8125, -0.015625, 0.926667), vec3(0.882812, -0.023438, 0.864167), vec3(0.882812, -0.015625, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[906] =
      Triangle(vec3(-0.882812, -0.015625, 0.918855), vec3(-0.882812, -0.023438, 0.864167), vec3(-0.8125, -0.015625, 0.926667),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[907] =
      Triangle(vec3(1.023438, 0.34375, 1.012605), vec3(0.945312, 0.304688, 0.942292), vec3(0.953125, 0.289062, 0.99698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[908] =
      Triangle(vec3(-0.953125, 0.289062, 0.99698), vec3(-0.945312, 0.304688, 0.942292), vec3(-1.023438, 0.34375, 1.012605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[909] =
      Triangle(vec3(1.171875, 0.359375, 1.09073), vec3(1.023438, 0.34375, 1.012605), vec3(1.039062, 0.328125, 1.067292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[910] =
      Triangle(vec3(-1.039062, 0.328125, 1.067292), vec3(-1.023438, 0.34375, 1.012605), vec3(-1.171875, 0.359375, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[911] =
      Triangle(vec3(1.234375, 0.25, 1.098542), vec3(1.171875, 0.359375, 1.09073), vec3(1.1875, 0.34375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[912] =
      Triangle(vec3(-1.1875, 0.34375, 1.137605), vec3(-1.171875, 0.359375, 1.09073), vec3(-1.234375, 0.25, 1.098542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[913] =
      Triangle(vec3(1.234375, 0.25, 1.098542), vec3(1.257812, 0.242188, 1.145417), vec3(1.210938, 0.085938, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[914] =
      Triangle(vec3(-1.234375, 0.25, 1.098542), vec3(-1.1875, 0.09375, 1.098542), vec3(-1.210938, 0.085938, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[915] =
      Triangle(vec3(1.1875, 0.09375, 1.098542), vec3(1.210938, 0.085938, 1.137605), vec3(1.046875, 0.0, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[916] =
      Triangle(vec3(-1.1875, 0.09375, 1.098542), vec3(-1.039062, 0.0, 1.020417), vec3(-1.046875, 0.0, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[917] =
      Triangle(vec3(1.039062, 0.0, 1.020417), vec3(1.046875, 0.0, 1.075105), vec3(0.882812, -0.015625, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[918] =
      Triangle(vec3(-1.039062, 0.0, 1.020417), vec3(-0.882812, -0.023438, 0.864167), vec3(-0.882812, -0.015625, 0.918855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[919] =
      Triangle(vec3(0.851562, 0.015625, 0.973542), vec3(0.9375, 0.0625, 0.989167), vec3(0.890625, 0.109375, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[920] =
      Triangle(vec3(-0.851562, 0.015625, 0.973542), vec3(-0.828125, 0.078125, 0.973542), vec3(-0.890625, 0.109375, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[921] =
      Triangle(vec3(0.9375, 0.0625, 0.989167), vec3(1.0, 0.125, 1.020417), vec3(0.960938, 0.171875, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[922] =
      Triangle(vec3(-0.9375, 0.0625, 0.989167), vec3(-0.890625, 0.109375, 0.981355), vec3(-0.960938, 0.171875, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[923] =
      Triangle(vec3(0.960938, 0.171875, 1.004792), vec3(1.0, 0.125, 1.020417), vec3(1.054688, 0.1875, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[924] =
      Triangle(vec3(-1.054688, 0.1875, 1.036042), vec3(-1.0, 0.125, 1.020417), vec3(-0.960938, 0.171875, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[925] =
      Triangle(vec3(1.054688, 0.1875, 1.036042), vec3(1.109375, 0.210938, 1.043855), vec3(1.085938, 0.273438, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[926] =
      Triangle(vec3(-1.054688, 0.1875, 1.036042), vec3(-1.015625, 0.234375, 1.02823), vec3(-1.085938, 0.273438, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[927] =
      Triangle(vec3(1.039062, 0.328125, 1.067292), vec3(0.953125, 0.289062, 0.99698), vec3(1.015625, 0.234375, 1.02823),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[928] =
      Triangle(vec3(-1.015625, 0.234375, 1.02823), vec3(-0.953125, 0.289062, 0.99698), vec3(-1.039062, 0.328125, 1.067292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[929] =
      Triangle(vec3(0.960938, 0.171875, 1.004792), vec3(1.015625, 0.234375, 1.02823), vec3(0.953125, 0.289062, 0.99698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[930] =
      Triangle(vec3(-0.960938, 0.171875, 1.004792), vec3(-0.890625, 0.234375, 0.973542), vec3(-0.953125, 0.289062, 0.99698),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[931] =
      Triangle(vec3(0.84375, 0.171875, 0.973542), vec3(0.890625, 0.109375, 0.981355), vec3(0.960938, 0.171875, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[932] =
      Triangle(vec3(-0.84375, 0.171875, 0.973542), vec3(-0.890625, 0.234375, 0.973542), vec3(-0.960938, 0.171875, 1.004792),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[933] =
      Triangle(vec3(0.828125, 0.078125, 0.973542), vec3(0.890625, 0.109375, 0.981355), vec3(0.84375, 0.171875, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[934] =
      Triangle(vec3(-0.84375, 0.171875, 0.973542), vec3(-0.890625, 0.109375, 0.981355), vec3(-0.828125, 0.078125, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[935] =
      Triangle(vec3(0.882812, -0.015625, 0.918855), vec3(0.9375, 0.0625, 0.989167), vec3(0.851562, 0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[936] =
      Triangle(vec3(-0.882812, -0.015625, 0.918855), vec3(-0.8125, -0.015625, 0.973542), vec3(-0.851562, 0.015625, 0.973542),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[937] =
      Triangle(vec3(1.046875, 0.0, 1.075105), vec3(1.0, 0.125, 1.020417), vec3(0.9375, 0.0625, 0.989167),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[938] =
      Triangle(vec3(-0.9375, 0.0625, 0.989167), vec3(-1.0, 0.125, 1.020417), vec3(-1.046875, 0.0, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[939] =
      Triangle(vec3(1.054688, 0.1875, 1.036042), vec3(1.0, 0.125, 1.020417), vec3(1.046875, 0.0, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[940] =
      Triangle(vec3(-1.054688, 0.1875, 1.036042), vec3(-1.210938, 0.085938, 1.137605), vec3(-1.046875, 0.0, 1.075105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[941] =
      Triangle(vec3(1.109375, 0.210938, 1.043855), vec3(1.054688, 0.1875, 1.036042), vec3(1.210938, 0.085938, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[942] =
      Triangle(vec3(-1.109375, 0.210938, 1.043855), vec3(-1.257812, 0.242188, 1.145417), vec3(-1.210938, 0.085938, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[943] =
      Triangle(vec3(1.1875, 0.34375, 1.137605), vec3(1.085938, 0.273438, 1.043855), vec3(1.109375, 0.210938, 1.043855),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[944] =
      Triangle(vec3(-1.109375, 0.210938, 1.043855), vec3(-1.085938, 0.273438, 1.043855), vec3(-1.1875, 0.34375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[945] =
      Triangle(vec3(1.039062, -0.101562, 0.981355), vec3(0.773438, -0.140625, 0.77823), vec3(0.789062, -0.125, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[946] =
      Triangle(vec3(-0.789062, -0.125, 0.981355), vec3(-0.773438, -0.140625, 0.77823), vec3(-1.039062, -0.101562, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[947] =
      Triangle(vec3(1.28125, 0.054688, 1.082917), vec3(1.039062, -0.101562, 0.981355), vec3(1.039062, -0.085938, 1.145417),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[948] =
      Triangle(vec3(-1.039062, -0.085938, 1.145417), vec3(-1.039062, -0.101562, 0.981355), vec3(-1.28125, 0.054688, 1.082917),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[949] =
      Triangle(vec3(1.28125, 0.054688, 1.082917), vec3(1.3125, 0.054688, 1.18448), vec3(1.367188, 0.296875, 1.15323),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[950] =
      Triangle(vec3(-1.28125, 0.054688, 1.082917), vec3(-1.351562, 0.320312, 1.075105), vec3(-1.367188, 0.296875, 1.15323),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[951] =
      Triangle(vec3(1.351562, 0.320312, 1.075105), vec3(1.367188, 0.296875, 1.15323), vec3(1.25, 0.46875, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[952] =
      Triangle(vec3(-1.351562, 0.320312, 1.075105), vec3(-1.234375, 0.507812, 1.075105), vec3(-1.25, 0.46875, 1.200105),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[953] =
      Triangle(vec3(1.234375, 0.507812, 1.075105), vec3(1.25, 0.46875, 1.200105), vec3(1.023438, 0.4375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[954] =
      Triangle(vec3(-1.234375, 0.507812, 1.075105), vec3(-1.023438, 0.476562, 0.96573), vec3(-1.023438, 0.4375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[955] =
      Triangle(vec3(1.023438, 0.476562, 0.96573), vec3(1.023438, 0.4375, 1.137605), vec3(0.859375, 0.382812, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[956] =
      Triangle(vec3(-1.023438, 0.476562, 0.96573), vec3(-0.890625, 0.40625, 0.887605), vec3(-0.859375, 0.382812, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[957] =
      Triangle(vec3(1.039062, -0.085938, 1.145417), vec3(0.789062, -0.125, 0.981355), vec3(0.859375, 0.382812, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[958] =
      Triangle(vec3(-1.039062, -0.085938, 1.145417), vec3(-1.023438, 0.4375, 1.137605), vec3(-0.859375, 0.382812, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[959] =
      Triangle(vec3(1.023438, 0.4375, 1.137605), vec3(1.25, 0.46875, 1.200105), vec3(1.3125, 0.054688, 1.18448),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[960] =
      Triangle(vec3(-1.3125, 0.054688, 1.18448), vec3(-1.25, 0.46875, 1.200105), vec3(-1.023438, 0.4375, 1.137605),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[961] =
      Triangle(vec3(0.820312, 0.328125, 0.856355), vec3(0.890625, 0.40625, 0.887605), vec3(0.859375, 0.382812, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[962] =
      Triangle(vec3(-0.820312, 0.328125, 0.856355), vec3(-0.773438, 0.265625, 1.09073), vec3(-0.859375, 0.382812, 1.036042),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[963] =
      Triangle(vec3(0.773438, 0.265625, 1.09073), vec3(0.859375, 0.382812, 1.036042), vec3(0.789062, -0.125, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[964] =
      Triangle(vec3(-0.789062, -0.125, 0.981355), vec3(-0.859375, 0.382812, 1.036042), vec3(-0.773438, 0.265625, 1.09073),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[965] =
      Triangle(vec3(0.59375, -0.125, 0.817292), vec3(0.640625, -0.007812, 1.082917), vec3(0.789062, -0.125, 0.981355),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  triangles[966] =
      Triangle(vec3(-0.789062, -0.125, 0.981355), vec3(-0.640625, -0.007812, 1.082917), vec3(-0.59375, -0.125, 0.817292),
               MaterialProperties(vec3(0.5, 0.5, 0.5), vec3(0)));
  Scene scene = Scene(triangles, 967, lights, 2);

  Ray ray = cameraRay(uv, iResolution.xy, vec3(2 * sin(iTime / 10), 2 * cos(iTime / 10), -5));
  vec3 col = renderRay(ray, scene);

  fragColor = vec4(col, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
