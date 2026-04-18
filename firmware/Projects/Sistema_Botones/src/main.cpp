#include <Arduino.h>

//importaciones y declaraciones declaraciones
int led = 2; 
//int btn = 12;

int estado = 0;
int estado_anterior = 0;


void setup() {
  // put your setup code here, to run once: inicializaciones
  Serial.begin(9600);

  pinMode(led, OUTPUT);//dejar salir voltaje
  //pinMode(btn, INPUT);

  Serial.println("Sistema de Botones");


}

void loop() {
  // put your main code here, to run repeatedly: hilo principal del sistema 
  
  digitalWrite(led, HIGH);
  delay(1000);

  digitalWrite(led, LOW);
  delay(1000);

  /*estado = digitalRead(btn);

  if ( estado == HIGH){
    digitalWrite(led, HIGH);

    if (!estado_anterior)
      Serial.println("Led ON");
    
    estado_anterior = estado;
  }

  if ( estado == LOW){
    digitalWrite(led, LOW);

    if (estado_anterior)
      Serial.println("Led OFF");
    
    estado_anterior = estado;
  }*/


}
