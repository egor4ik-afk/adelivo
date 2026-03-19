// src/types/yandex-maps.d.ts
// Минимальные типы для Yandex Maps 2.1
// @types/yandex-maps удалите из devDependencies — их типы неполные

declare namespace ymaps {
  function ready(callback: () => void): void;

  class Map {
    constructor(
      element: HTMLElement | string,
      state: { center: number[]; zoom: number; controls?: string[] },
      options?: object
    );
    geoObjects: {
      add(obj: Clusterer | Placemark): void;
      remove(obj: Clusterer | Placemark): void;
    };
    panTo(coords: number[], options?: { flying?: boolean; duration?: number }): void;
    setCenter(coords: number[], zoom?: number): void;
    destroy(): void;
  }

  class Placemark {
    constructor(
      geometry: number[],
      properties?: {
        balloonContentHeader?: string;
        balloonContentBody?: string;
        hintContent?: string;
        [key: string]: unknown;
      },
      options?: {
        preset?: string;
        iconColor?: string;
        [key: string]: unknown;
      }
    );
    events: {
      add(event: string, handler: () => void): void;
      remove(event: string, handler: () => void): void;
    };
  }

  class Clusterer {
    constructor(options?: {
      clusterIconLayout?: string;
      clusterIconPieChartRadius?: number;
      clusterIconPieChartCoreRadius?: number;
      clusterIconPieChartStrokeWidth?: number;
      [key: string]: unknown;
    });
    add(placemarks: Placemark | Placemark[]): void;
    remove(placemarks: Placemark | Placemark[]): void;
    removeAll(): void;
  }
}

declare global {
  interface Window {
    ymaps: typeof ymaps;
  }
}