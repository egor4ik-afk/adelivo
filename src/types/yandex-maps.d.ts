// src/types/yandex-maps.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace ymaps {
  type Ready = (callback: () => void) => void;
  export const ready: Ready;

  export namespace templateLayoutFactory {
    export function createClass(template: string, overrides?: any): any;
  }

  export namespace multiRouter {
    class MultiRoute {
      constructor(
        model: { referencePoints: (number[] | string)[]; params?: { routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle'; [key: string]: any }; },
        options?: any
      );
      model: { events: { add(event: string, handler: (e?: any) => void): void; remove(event: string, handler: (e?: any) => void): void; }; };
      getActiveRoute(): any;
      destroy(): void;
    }
  }

  class GeoObjectCollection {
    constructor();
    add(child: any): this;
    remove(child: any): this;
    removeAll(): this;
    each(callback: (el: any) => void): void;
  }

  class Map {
    constructor(element: string | HTMLElement, state: { center: number[]; zoom: number; controls?: string[]; behaviors?: string[]; type?: string; }, options?: any);
    geoObjects: { add(geoObject: any): void; remove(geoObject: any): void; removeAll(): void; each(callback: (geoObject: any) => void): void; getBounds(): number[][] | null; };
    container: { fitToViewport(): void; };
    behaviors: { enable(behavior: string | string[]): void; disable(behavior: string | string[]): void; };
    setCenter(center: number[], zoom?: number, options?: { duration: number }): void;
    setBounds(bounds: number[][], options?: { checkZoomRange?: boolean; zoomMargin?: number; maxZoom?: number; duration?: number }): void;
    events: { add(event: string, handler: (e: any) => void): void; remove(event: string, handler: (e: any) => void): void; };
    controls: { get(controlName: string): any; };
  }

  class Placemark {
    constructor(geometry: number[], properties?: any, options?: any);
    events: { add(event: string, handler: () => void): void; remove(event: string, handler: () => void): void; };
  }

  class Clusterer {
    constructor(options?: any);
    add(placemarks: any): void;
    remove(placemarks: any): void;
    removeAll(): void;
  }
}

declare global { interface Window { ymaps: typeof ymaps; } }