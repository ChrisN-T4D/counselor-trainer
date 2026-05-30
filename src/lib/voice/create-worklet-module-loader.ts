const urlCache = new Map<string, string>();

export function createWorkletModuleLoader(name: string, sourceCode: string) {
  return async (worklet: AudioWorklet, path?: string) => {
    const cachedUrl = urlCache.get(name);
    if (cachedUrl) {
      return worklet.addModule(cachedUrl);
    }

    if (path) {
      try {
        await worklet.addModule(path);
        urlCache.set(name, path);
        return;
      } catch (error) {
        throw new Error(
          `Failed to load the ${name} worklet module from path: ${path}. Error: ${error}`,
        );
      }
    }

    const blob = new Blob([sourceCode], { type: "application/javascript" });
    const blobURL = URL.createObjectURL(blob);
    try {
      await worklet.addModule(blobURL);
      urlCache.set(name, blobURL);
      return;
    } catch {
      URL.revokeObjectURL(blobURL);
    }

    try {
      const base64 = btoa(sourceCode);
      const moduleURL = `data:application/javascript;base64,${base64}`;
      await worklet.addModule(moduleURL);
      urlCache.set(name, moduleURL);
    } catch {
      throw new Error(
        `Failed to load the ${name} worklet module. Make sure the browser supports AudioWorklets.`,
      );
    }
  };
}
