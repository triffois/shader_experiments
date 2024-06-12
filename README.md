# Shader experiments

This a repository with shaders (glsl files) we made during our raytracer creation process. Some are historical and no longer work with the latest c++ release, and some still work with it.

As of June 11, 2024 the latest shader is `structured/global_illumination.glsl`. It is one of the slowest too, though. If you want to test more lightweight shaders, you can try:
- multibounce - it is a version prior to global illumination - almost as slow as global_illumination
- moving - it is a version prior to refractions and reflections - recommended, if speed is an issue
- basic - same as above, but without the moving ability. It will just rotate around the center of the scene 

# Glitches

These are cool visual effects that we've accidentally discovered when not quite managing to get things right with the raytracer.

### 1.

This was after trying to add a reflection plane to the sphere + ground plane scene. The sphere-plane intersection was not working correctly, and the result was this cool glitch.
