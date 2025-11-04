---
layout: post
title: Spring Boot version 4
description: >
  Spring boot 4 is the latest major release of the popular Java framework for building web applications and microservices.
image: /assets/img/develop/spring-boot-4.jpg
sitemap: false
---

## 플랫폼/베이스라인 변화
•	Spring Framework 7 기반: 이번 메이저는 전부 Spring Framework 7 위에서 돌아가. SF7은 JDK 17을 최소로 유지하면서도 JDK 25 LTS까지 적극 권장하고, Jakarta EE 11(Tomcat 11, Hibernate ORM 7, Validator 9)을 베이스로 잡아.  
•	Java 버전: Boot 4 자체도 Java 17+ 필요(가능하면 최신 LTS 권장). Kotlin은 2.x (2.2+) 권장·지원. GraalVM Native는 25 세대를 권장.  
•	Gradle 9 지원: 공식적으로 Gradle 9 호환을 공지.  

## 가장 큰 구조적 변화: “모듈화(Modularization)”
•	기존의 거대한 spring-boot-autoconfigure를 다수의 작은 모듈로 쪼갬. 필요한 기능만 당겨 쓰게 되어 클래스패스/스캔/디스크 풋프린트 감소 + IDE 자동완성·설정 힌트가 더 깔끔해짐.  
•	스타터 전면 정비: 기술별 모듈에 맞춰 스타터 구성을 재정렬. 예를 들어 Flyway는 더 이상 jar만 추가로 자동 설정되지 않고 전용 스타터를 넣어야 함. 일부 스타터는 이름이 더 명확하게 바뀜(예: web → webmvc).  
•	테스트 스타터 신설: 운영 스타터마다 대응 테스트 스타터가 생김(예: spring-boot-starter-webmvc-test).  
•	Classic 스타터 제공: 일단 빨리 올려야 한다면, 예전처럼 “큰 덩어리”로 묶은 classic 스타터로 올리고, 이후 점진적으로 모듈형으로 갈아타는 전략 가능.  

## 웹/HTTP 스택의 기능 추가
•	Declarative HTTP Client: @HttpServiceClient 기반의 선언적 HTTP 인터페이스(Feign 유사). Boot 4 M2에서 공지.  
•	API Versioning: 프레임워크 차원의 버저닝 지원이 공식화(버전별 라우팅 등). M2 릴리스 노트에 포함.  
•	RestTestClient: 테스트용 HTTP 클라이언트 지원(통합 테스트 DX 향상). RC1에서 언급.  

## 관측 가능성(Observability) & 운영
•	OpenTelemetry 스타터 강화: OTel 연동을 더 쉽게(기본 설정 강화).  
•	Redis 관측성 개선: Redis 관련 메트릭/트레이싱 노출 강화. RC1 노트.  

## 언어/라이브러리 생태계 업데이트
•	Jackson 3, JUnit 6, Kotlin 2 등 차세대 스택으로 상향. Jakarta EE 11 정렬과 함께 “이번 메이저 라운드의 공통 방향”으로 공식 블로그에 명시.  

## 부수적이지만 유용한 변화들
•	JSpecify 기반 Null-safety 주석: IDE·정적분석에서 NPE 방지 효율 ↑. M2에 포함.  
•	모듈화 완료 및 테스트 스타터 추가: RC1에서 “모듈화 작업 완료”를 알림.  

---

## 업그레이드 체크리스트(실무용 요약)
1.	JDK 17+ 준비(가능하면 JDK 21/25 LTS) → CI/CD 빌드 이미지도 함께 교체.
2.	Spring Framework 7 의존성 라인으로 전체 정렬(Jakarta EE 11 계열 포함).
3.	스타터 재정비
•	spring-boot-starter-web ➜ spring-boot-starter-webmvc (WebFlux면 그에 맞는 스타터)
•	DB 마이그/관리는 전용 스타터 필수(예: spring-boot-starter-flyway).
•	각 스타터에 -test를 test scope로 추가.  ￼
4.	Classic 스타터로 임시 올림 → 모듈별로 점진 분해(대규모 레포/사내 공용 스타터가 있을 때 특히 유용).  ￼
5.	OTel·관측성 설정 재검토(새 스타터로 간소화, Redis 메트릭/트레이싱 확인).  ￼
6.	빌드 도구 업데이트: Gradle 9 지원 확인.  ￼
7.	테스트/런타임 호환성: Jackson 3, JUnit 6 도입에 따른 테스트 유틸/모킹 라이브러리 호환 확인.  ￼

---

## 코드/설정 예시(Gradle, 간단 스케치)

실서비스에선 당신 환경(멀티모듈, BOM, 버전 카탈로그 등)에 맞춰 조정하세요.

```plaintext
plugins {
    id("org.springframework.boot") version "4.0.0-RC1" // GA 나오면 교체
    id("io.spring.dependency-management") version "1.1.6"
    kotlin("jvm") version "2.2.0" // 사용 시
    kotlin("plugin.spring") version "2.2.0"
}

java { 
    toolchain { 
        languageVersion.set(JavaLanguageVersion.of(21)) 
    } 
} // 최소 17+

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:4.0.0-RC1"))

    // Web MVC
    implementation("org.springframework.boot:spring-boot-starter-webmvc")

    // Flyway는 전용 스타터 필요
    implementation("org.springframework.boot:spring-boot-starter-flyway")

    // OpenTelemetry(관측성)
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")

    // 선언적 HTTP 클라이언트 사용 시
    implementation("org.springframework.boot:spring-boot-starter-http-client")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
}
```


---
참고: 공식 발표/문서(최근순)  
•	RC1 릴리스 블로그: 모듈화 작업 완료, RestTestClient, Redis 관측성 강화.  
•	모듈화 상세 블로그: 모듈 경계, 스타터·테스트 스타터, Classic 스타터, 마이그레이션 예시.  
•	M2 릴리스 블로그: Gradle 9, @HttpServiceClient, API Versioning, JSpecify, OTel 스타터 개선.  
•	Road to GA(총론): JDK 17 유지, Jakarta EE 11/ Jackson 3/ JUnit 6/ Kotlin 2 로드맵과 주간 연재 목록(예: Spring gRPC 예정).  
•	Boot 4 마이그 가이드/요건: Java 17+, Kotlin 2.2+, GraalVM 25, Servlet 6.1/Jakarta EE 11, Framework 7.x.  

