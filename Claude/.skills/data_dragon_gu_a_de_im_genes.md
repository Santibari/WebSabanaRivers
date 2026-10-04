# Guía de URLs de Data Dragon: Imágenes de Campeones de League of Legends

Esta documentación establece las reglas para construir correctamente las URLs y acceder a los recursos gráficos de los campeones de League of Legends a través de Data Dragon (Riot Games). 

## 1. Íconos Cuadrados (Champion Square Assets)
Estas imágenes dependen del parche actual del juego. Es obligatorio incluir la versión específica en la URL.

* **Formato de URL:** `https://ddragon.leagueoflegends.com/cdn/{VERSION_DEL_JUEGO}/img/champion/{Nombre}.png`
* **Nota:** Debes actualizar la variable `{VERSION_DEL_JUEGO}` (ej. `14.8.1`) al parche más reciente para garantizar que los campeones nuevos o los rediseños visuales carguen correctamente.

**Ejemplo de uso en HTML:**
```html
<img src="https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/Aatrox.png" alt="Ícono de Aatrox">
```

## 2. Banners Verticales (Pantalla de carga / Loading Screen)
Estos enlaces son universales; no requieren especificar el número de versión del parche en la URL.

* **Formato de URL:** `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{Nombre}_{NumeroSkin}.jpg`
* **Nota:** El sufijo `_0` representa el aspecto (skin) base o clásico del campeón. Cambiar el número por `_1`, `_2`, `_3`, etc., cargará los aspectos alternativos de dicho campeón.

**Ejemplo de uso en HTML:**
```html
<img src="https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Aatrox_0.jpg" alt="Banner base de Aatrox">
```

## ⚠️ Reglas de Nomenclatura Estricta (CRÍTICO)
Para evitar errores de red (404 Not Found), la variable `{Nombre}` del campeón en la URL debe coincidir exactamente con el ID interno de la base de datos de Riot. Aplica las siguientes reglas:

1. **Capitalización simple:** La primera letra siempre va en mayúscula y el resto en minúscula (ej. `Ahri`, `Zed`).
2. **Cero espacios:** Elimina todos los espacios en blanco (ej. Miss Fortune pasa a ser `MissFortune`, Xin Zhao pasa a ser `XinZhao`).
3. **Cero caracteres especiales o puntuación:** Elimina apóstrofes (ej. Kai'Sa pasa a ser `Kaisa`, Vel'Koz pasa a ser `Velkoz`).
   * *Excepción de mayúsculas:* Kha'Zix mantiene sus dos mayúsculas en el ID: `KhaZix`.
4. **Excepciones de nombres internos:** Algunos campeones tienen un ID que no coincide con su nombre público:
   * Wukong se identifica como `MonkeyKing`.
   * Nunu & Willump se identifica como `Nunu`.
   * Renata Glasc se identifica como `Renata`.

## 💡 Consejo para Desarrolladores
Si estás programando una web que liste a múltiples campeones, no escribas las URLs a mano. Busca y consume el archivo `champion.json` de Data Dragon. Este archivo contiene un diccionario oficial con los "IDs" exactos de todos los campeones. Puedes iterar sobre este archivo usando lenguajes como JavaScript, PHP o Python para generar las etiquetas de imágenes automáticamente y sin errores.