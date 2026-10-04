# Guía de Extracción: Íconos de Roles en Community Dragon

Este documento detalla la ubicación exacta para descargar los íconos representativos de las posiciones de League of Legends[cite: 3], incluyendo el casco de la línea superior[cite: 4], directamente desde los archivos originales del cliente alojados en Community Dragon.

## URL Base
Todas las rutas deben añadirse después del dominio principal y la versión (se recomienda usar `latest` para la versión actual):
`https://raw.communitydragon.org/latest/`

## Ruta de los Directorios
Los íconos de la interfaz del cliente (UI) se encuentran en la carpeta de recursos estáticos del Front-End:
`plugins/rcp-fe-lol-static-assets/global/default/images/roles/`

## Nombres de los Archivos por Línea
Dentro de la carpeta mencionada, encontrarás los archivos en formato `.png` (con fondo transparente) y `.svg` (vectoriales). Riot Games utiliza nombres internos específicos para algunas posiciones (como "bottom" para ADC y "utility" para Soporte):

*   **Carril Superior (Top / Casco[cite: 4]):** `top.png` o `top.svg`
*   **Jungla (Jungle / Hierba):** `jungle.png` o `jungle.svg`
*   **Carril Central (Mid / Diagonal):** `mid.png` o `mid.svg`
*   **Carril Inferior / ADC (Bottom / Esquina):** `bottom.png` o `bottom.svg`
*   **Soporte (Utility / Alas):** `utility.png` o `utility.svg`

## Ejemplo de enlace directo
Si deseas cargar el ícono de la línea superior en formato PNG directamente en una web, la URL completa sería:
`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/roles/top.png`

> **Nota para desarrolladores:** En algunas actualizaciones del cliente, Riot también guarda variantes de color (como los dorados[cite: 3] o los grises[cite: 4]) en la ruta `plugins/rcp-fe-lol-uikit/global/default/images/` bajo los nombres `position-icon-top.png`, `position-icon-jungle.png`, etc.