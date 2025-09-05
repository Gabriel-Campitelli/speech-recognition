# EscuchApp

Este proyecto está diseñado para ayudar a personas hipoacúsicas a conectarse con su entorno, facilitando la comunicación y la integración mediante el uso de un dispositivo móvil, como un celular.

Para descargar un modelo desde huggingface:
1- Instalar git lfs:
brew install git-lfs
git lfs install

2- Usar git lfs para clonar el modelo que quiera, en este caso Xenova/whisper-base en la carpeta models dentro de assets con el nombre: xenova-whisper-base
git lfs clone https://huggingface.co/Xenova/whisper-base ./src/assets/huggingface-models/xenova-whisper-base
