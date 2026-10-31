import { Component, input } from '@angular/core';
@Component({
  selector: 'app-quiz-artwork',
  template: `<div class="quiz-art" [attr.data-kind]="kind()" aria-hidden="true">
    @switch (kind()) {
      @case ('quran') {
        <div class="book-art"><span>Худ</span><span>Юсуф</span><span>Нух</span></div>
        <span class="art-caption">Три суры · одна тема</span>
      }
      @case ('code') {
        <span class="code-art">&#123; &lt;/&gt; &#125;</span
        ><span class="art-caption">Думаем как разработчики</span>
      }
      @default {
        <span class="planet-art"><span>?</span></span
        ><span class="art-caption">Мир полон вопросов</span>
      }
    }
  </div>`,
})
export class QuizArtwork {
  readonly kind = input<'quran' | 'code' | 'world'>('world');
}
